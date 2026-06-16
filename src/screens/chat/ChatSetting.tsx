import React, { useMemo, useState, useCallback } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Image,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  type ImageStyle,
  DeviceEventEmitter,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { ChevronRight, ChevronLeft, Check, Copy, LogOut, Edit3 } from 'lucide-react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import * as Clipboard from 'expo-clipboard';
import { Q } from '@nozbe/watermelondb';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafeScreen } from '../../components/layout';

import { supabase } from '@/lib/supabase';
import { resolvePersonDisplayName } from '@/lib/identity/resolveDisplayName';
import { isOpenRoomKind, resolveChatAvatarUrl, resolveChatDisplayName } from '@/utils/chat/resolveChatDisplayName';
import { database } from '@/lib/chatDB/database';
import { removeLocalChatRoom, syncChatRooms } from '@/lib/chatSync/roomSync';
import { CHAT_THEMES, getChatTheme, type ChatRoomType } from '@/screens/chat/theme/chatTheme';
import { useChatStatusBar } from './hooks/useChatStatusBar';
import RoomAccessGuardOverlay from './components/RoomAccessGuardOverlay';
import { createChatSettingTheme, type ChatSettingTheme } from './ChatSetting.theme';
import CoonnAlert from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastThemeFromChatSetting } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import TranslationSettingsPanel, { summarizeTranslationSettings } from './components/TranslationSettingsPanel';
import { fetchRoomSettings, upsertRoomSettings, type RoomSettingsRow } from './services/roomSettings';
import secureRuntimeStore, { type SecureKeyBackupStatus, type SecurePeerRecoveryRequest, type SecurePeerRecoveryRequestList } from '@/lib/chatSecurity/secureRuntimeStore';
import type { TranslationTier, TranslationTone } from './hooks/useChatUIState';

type Member = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  raw_avatar_url?: string | null;
  avatar_visible?: boolean | null;
  open_profile_id?: string | null;
  status_message?: string | null;
  is_me: boolean;
  role?: string | null;
};

type InitialRoomSnapshot = {
  roomId?: string | number | null;
  id?: string | number | null;
  title?: string | null;
  roomTitle?: string | null;
  roomName?: string | null;
  room_name?: string | null;
  baseTitle?: string | null;
  roomType?: string | null;
  type?: string | null;
  roomSubtype?: string | null;
  subtype?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  roomCover?: string | null;
  roomAvatarUrl?: string | null;
  room_avatar_url?: string | null;
  coverImageUrl?: string | null;
  cover_image_url?: string | null;
  useDefaultCover?: boolean | null;
  use_default_cover?: boolean | null;
  joinedAt?: string | null;
  joined_at?: string | null;
  startedAt?: string | null;
  createdAt?: string | null;
  memberCount?: number | null;
  pinned?: boolean | null;
  muted?: boolean | null;

  /**
   * Optional theme snapshot values passed from Chat/List navigation.
   * These are used only for initial optimistic rendering before the room
   * settings row is loaded from the server.
   */
  chatThemeKey?: string | null;
  chatThemeType?: string | null;
  themeOverride?: string | null;
  chat_theme_key?: string | null;
  chat_theme_type?: string | null;
  theme_override?: string | null;
  autoTranslate?: boolean | null;
  auto_translate?: boolean | null;
  showTranslatedOnly?: boolean | null;
  show_translated_only?: boolean | null;
  translationTier?: string | null;
  translation_tier?: string | null;
  translationTone?: string | null;
  translation_tone?: string | null;
  viewLang?: string | null;
  view_lang?: string | null;
  view_lang_override?: string | null;
  preferredLang?: string | null;
  preferred_lang?: string | null;
  send_lang_override?: string | null;
};

type ChatThemeKey = ChatRoomType | 'default';


const CHAT_SETTING_MY_MEMBER_SELECT =
  'user_id, room_id, role, room_name, use_default_cover, room_avatar_url, joined_at, theme_override, is_input_locked' as const;

const AUTO_SEND_LANG = 'AUTO';

const EMPTY_SECURE_BACKUP_STATUS: SecureKeyBackupStatus = {
  exists: false,
  updatedAt: null,
  createdAt: null,
  keyCount: 0,
  roomCount: 0,
  backupVersion: null,
  deviceId: null,
  lastRestoredAt: null,
};

const EMPTY_SECURE_RECOVERY_REQUESTS: SecurePeerRecoveryRequestList = {
  incoming: [],
  outgoing: [],
};

type TranslationRuntimeDefaults = {
  settingLang: string;
  settingUpper: string;
  userTier: TranslationTier;
  baseTier: TranslationTier;
  baseTone: TranslationTone;
  baseView: string;
  basePreferred: string | null;
};

function normalizeLangCode(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return upper === AUTO_SEND_LANG ? null : upper;
}

function isAutoSendLang(value: unknown): boolean {
  const raw = String(value ?? '').trim().toUpperCase();
  return !raw || raw === AUTO_SEND_LANG;
}

function normalizeManualSendLang(value: unknown): string | null {
  if (isAutoSendLang(value)) return null;
  return normalizeLangCode(value);
}

function normalizeTranslationTier(value: unknown): TranslationTier {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'mid' || v === 'standard') return 'mid';
  if (v === 'high' || v === 'premium') return 'high';
  return 'free';
}

function normalizeTranslationTone(value: unknown): TranslationTone {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'business' || v === 'polite' || v === 'casual' || v === 'neutral' || v === 'creative') {
    return v as TranslationTone;
  }
  if (v === 'nature' || v === 'natural') return 'neutral';
  return 'neutral';
}

function buildTranslationDefaults(profile: any): TranslationRuntimeDefaults {
  const settingLang = String(profile?.setting_lang ?? 'ko');
  const settingUpper = normalizeLangCode(settingLang) ?? 'KO';
  const userTier = normalizeTranslationTier(profile?.user_tier ?? 'free');
  const baseTier = normalizeTranslationTier(profile?.translation_tier ?? userTier);
  const baseTone = normalizeTranslationTone(profile?.translation_tone_default ?? 'neutral');
  const baseView = normalizeLangCode(profile?.view_lang ?? null) ?? settingUpper;
  const basePreferred = normalizeManualSendLang(profile?.preferred_lang ?? null);
  return { settingLang, settingUpper, userTier, baseTier, baseTone, baseView, basePreferred };
}

function buildTranslationConfig(row: RoomSettingsRow | null | undefined, defaults: TranslationRuntimeDefaults) {
  return {
    autoTranslate: row?.auto_translate ?? true,
    showTranslatedOnly: row?.show_translated_only ?? false,
    translationTier: normalizeTranslationTier(row?.translation_tier ?? defaults.baseTier),
    translationTone: normalizeTranslationTone(row?.translation_tone ?? defaults.baseTone),
    viewLang: normalizeLangCode(row?.view_lang ?? defaults.baseView) ?? defaults.baseView,
    preferredLang: row ? normalizeManualSendLang((row as any)?.preferred_lang) : null,
  };
}


function safeJsonParse(value: unknown): any | null {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  const raw = String(value).trim();
  if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeIso(ms: unknown): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  try {
    return new Date(n).toISOString();
  } catch {
    return '';
  }
}

function sanitizeExportFileName(input: string): string {
  const cleaned = String(input ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .replace(/^[\s_]+|[\s_]+$/g, '')
    .slice(0, 120);
  return cleaned || 'coonn-chat-export';
}

function formatDateForFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function pickOriginalText(raw: any): string {
  const original = safeJsonParse(raw?.original);
  if (typeof original === 'string' && original.trim()) return original.trim();
  if (original && typeof original === 'object') {
    const text =
      original.text ??
      original.content ??
      original.original_text ??
      original.originalText ??
      original.caption ??
      null;
    if (typeof text === 'string' && text.trim()) return text.trim();
  }
  return '';
}

function pickMessageText(raw: any, isMine: boolean): string {
  if (raw?.deleted_for_all_at) return chatStaticText('chat:settings.export.deletedMessage', '[삭제된 메시지]');
  if (raw?.is_secure) return chatStaticText('chat:settings.export.secureExcluded', '[보안 메시지 - 내보내기 제외]');

  const kind = String(raw?.kind ?? 'text');
  const content = String(raw?.content ?? '').trim();
  const originalText = pickOriginalText(raw);

  const preferred = isMine ? originalText || content : content || originalText;
  if (preferred) return preferred;

  if (kind === 'image') return chatStaticText('chat:settings.export.imageLabel', '[이미지]');
  if (kind === 'video') return chatStaticText('chat:settings.export.videoLabel', '[동영상]');
  if (kind === 'audio') return chatStaticText('chat:settings.export.audioLabel', '[음성]');
  if (kind === 'file') return chatStaticText('chat:settings.export.fileLabel', '[파일]');
  return '';
}

async function ensureExportDir(): Promise<string> {
  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
  const dir = `${root}coonn/exports/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

async function resolveRoomTitle(roomId: number): Promise<string> {
  try {
    const room = await database.get<any>('rooms').find(String(roomId));
    const raw = (room as any)?._raw ?? room;
    const title = String(raw?.title ?? raw?.room_name ?? raw?.name ?? '').trim();
    if (title) return title;
  } catch {}
  return `room-${roomId}`;
}

async function fetchProfileLabels(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds.map((v) => String(v ?? '').trim()).filter(Boolean)));
  const map = new Map<string, string>();
  if (!uniqueIds.length) return map;

  try {
    const localRows = await database
      .get<any>('profiles')
      .query(Q.where('user_id', Q.oneOf(uniqueIds)))
      .fetch();
    for (const row of localRows) {
      const raw = (row as any)?._raw ?? row;
      const userId = String(raw?.user_id ?? '').trim();
      const nickname = String(raw?.nickname ?? '').trim();
      if (userId && nickname) map.set(userId, nickname);
    }
  } catch {}

  const missing = uniqueIds.filter((id) => !map.has(id));
  if (missing.length) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id,nickname')
        .in('user_id', missing);
      if (!error && Array.isArray(data)) {
        for (const row of data as any[]) {
          const userId = String(row?.user_id ?? '').trim();
          const nickname = String(row?.nickname ?? '').trim();
          if (userId && nickname) map.set(userId, nickname);
        }
      }
    } catch {}
  }

  return map;
}

function senderLabelForExport(senderId: string, myUserId: string | null, labels: Map<string, string>): string {
  const id = String(senderId ?? '').trim();
  if (!id) return chatStaticText('chat:settings.export.unknownSender', '알 수 없음');
  const label = labels.get(id);
  if (label) return label;
  if (myUserId && id === myUserId) return chatStaticText('chat:settings.export.meSender', '나');
  return chatStaticText('chat:settings.export.userSender', '사용자');
}

async function exportRoomConversation(roomId: number): Promise<string> {
  const [messages, attachments, sessionResult, roomTitle] = await Promise.all([
    database
      .get<any>('messages')
      .query(Q.where('room_id', roomId), Q.sortBy('created_at', Q.asc))
      .fetch(),
    database
      .get<any>('chat_attachments')
      .query(Q.where('room_id', roomId), Q.sortBy('sort_order', Q.asc))
      .fetch(),
    supabase.auth.getSession().catch(() => ({ data: { session: null }, error: null } as any)),
    resolveRoomTitle(roomId),
  ]);

  const myUserId = String((sessionResult as any)?.data?.session?.user?.id ?? '').trim() || null;
  const senderIds = messages
    .map((message) => String(((message as any)?._raw ?? message)?.sender_id ?? '').trim())
    .filter(Boolean);
  const profileLabels = await fetchProfileLabels(senderIds);

  const attachmentMap = new Map<string, any[]>();
  for (const attachment of attachments) {
    const raw = (attachment as any)?._raw ?? attachment;
    const keys = [raw?.message_id, raw?.message_uid]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
    for (const key of keys) {
      const list = attachmentMap.get(key) ?? [];
      list.push(raw);
      attachmentMap.set(key, list);
    }
  }

  const lines: string[] = [];
  lines.push(chatStaticText('chat:settings.export.fileTitle', 'CO·ONN 대화 내용 내보내기'));
  lines.push(chatStaticText('chat:settings.export.roomLine', '채팅방: {{roomTitle}}', { roomTitle }));
  lines.push(chatStaticText('chat:settings.export.exportedAtLine', '내보낸 시각: {{exportedAt}}', { exportedAt: new Date().toISOString() }));
  lines.push('');
  lines.push(chatStaticText('chat:settings.export.noteLocal', '※ 이 파일은 현재 기기에 저장된 대화 기준입니다.'));
  lines.push(chatStaticText('chat:settings.export.noteText', '※ 내 메시지는 원문 기준, 상대방 메시지는 현재 표시 본문 기준으로 내보냅니다.'));
  lines.push(chatStaticText('chat:settings.export.noteSecure', '※ 보안모드 메시지 본문/암호문/키 정보는 내보내지 않습니다.'));
  lines.push(chatStaticText('chat:settings.export.noteGallery', '※ 사진첩에 사용자가 직접 저장한 파일은 앱 캐시와 별도로 관리됩니다.'));
  lines.push('');

  for (const message of messages) {
    const raw = (message as any)?._raw ?? message;
    const createdAt = safeIso(raw?.created_at) || '-';
    const senderId = String(raw?.sender_id ?? '').trim();
    const sender = senderLabelForExport(senderId, myUserId, profileLabels);
    const kind = String(raw?.kind ?? 'text');
    const isMine = !!myUserId && senderId === myUserId;
    const text = pickMessageText(raw, isMine);
    const keys = [raw?.id, raw?.message_uid]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
    const mediaRows = keys.flatMap((key) => attachmentMap.get(key) ?? []);

    lines.push(`[${createdAt}] ${sender} (${kind})`);
    if (text) lines.push(text);

    for (const media of mediaRows) {
      const type = String(media?.type ?? 'file');
      const fileName = String(media?.file_name ?? '').trim();
      const mime = String(media?.mime ?? '').trim();
      const url = String(media?.url ?? '').trim();
      lines.push(
        chatStaticText('chat:settings.export.attachmentLine', '- 첨부: {{type}}{{fileNamePart}}{{mimePart}}', { type, fileNamePart: fileName ? ` / ${fileName}` : '', mimePart: mime ? ` / ${mime}` : '' }),
      );
      if (url) lines.push(`  URL: ${url}`);
    }

    lines.push('');
  }

  const dir = await ensureExportDir();
  const stamp = formatDateForFileName();
  const path = `${dir}${sanitizeExportFileName(`coonn-${roomTitle}-${stamp}`)}.txt`;
  await FileSystem.writeAsStringAsync(path, lines.join('\n'), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const info: any = await FileSystem.getInfoAsync(path, { size: true } as any);
  if (!info?.exists || Number(info?.size ?? 0) <= 0) {
    throw new Error('export_file_not_created');
  }

  return path;
}

function getExportFileName(fileUri: string): string {
  const name = decodeURIComponent(fileUri.split('/').filter(Boolean).pop() ?? 'coonn-chat-export.txt');
  return name.endsWith('.txt') ? name : `${name}.txt`;
}

async function shareExportFile(fileUri: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('sharing_not_available');

  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/plain',
    dialogTitle: chatStaticText('chat:settings.export.shareDialogTitle', '대화 내용 공유하기'),
    UTI: 'public.plain-text',
  });
}

async function saveExportFile(fileUri: string): Promise<void> {
  const fileName = getExportFileName(fileUri);

  if (Platform.OS === 'android') {
    const storageAccessFramework = (FileSystem as any).StorageAccessFramework;

    if (storageAccessFramework?.requestDirectoryPermissionsAsync && storageAccessFramework?.createFileAsync) {
      const permission = await storageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission?.granted || !permission?.directoryUri) {
        throw new Error('save_cancelled');
      }

      const targetUri = await storageAccessFramework.createFileAsync(
        permission.directoryUri,
        fileName,
        'text/plain',
      );
      const content = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await FileSystem.writeAsStringAsync(targetUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return;
    }
  }

  await shareExportFile(fileUri);
}

function classifyRoom(serverType?: string | null, subtype?: string | null) {
  const t = (serverType || '').toLowerCase();
  const st = (subtype || '').toLowerCase();

  const isSelf = t === 'self' || st === 'self';
  const isDM = !isSelf && (t === 'dm' || t === 'personal' || t === 'direct' || t === 'business_dm' || st === 'business_dm');
  const isGroup = !isSelf && !isDM && (t === 'group' || t === 'grp');
  const isOpen = t === 'open' || t === 'openchat' || t === 'open_talk' || t === 'opentalk';
  const isBeacon = t === 'beacon';

  return { isSelf, isDM, isGroup, isOpen, isBeacon };
}

function isVisibleOnlyLeaveRoomType(serverType?: string | null, subtype?: string | null): boolean {
  const t = String(serverType ?? '').trim().toLowerCase();
  const st = String(subtype ?? '').trim().toLowerCase();

  return (t === 'dm' || t === 'personal' || t === 'private' || t === 'direct') && st !== 'business_dm';
}

function canManageOpenChatProfile(input: { isOpen?: boolean; ownerId?: string | null; myId?: string | null; role?: string | null }) {
  if (!input.isOpen || !input.myId) return false;
  if (input.ownerId && input.ownerId === input.myId) return true;
  const role = String(input.role ?? '').trim().toLowerCase();
  return role === 'host' || role === 'owner' || role === 'admin' || role === 'operator';
}


function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
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

async function loadViewerFriendAliasMap(
  viewerUserId: string,
  targetUserIds: string[],
): Promise<Map<string, string | null>> {
  const ids = Array.from(
    new Set(
      targetUserIds
        .map((id) => String(id ?? '').trim())
        .filter((id) => id && id !== viewerUserId),
    ),
  );
  const out = new Map<string, string | null>();
  if (!viewerUserId || ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const { data } = await supabase
      .from('friend_meta')
      .select('friend_user_id,alias,is_friend')
      .eq('owner_user_id', viewerUserId)
      .in('friend_user_id', part)
      .eq('is_friend', true);

    ((data ?? []) as Array<{ friend_user_id?: string | null; alias?: string | null }>).forEach((row) => {
      const uid = String(row?.friend_user_id ?? '').trim();
      if (!uid) return;
      out.set(uid, asString(row?.alias));
    });
  }

  return out;
}

function buildGroupTitle(peerNames: string[]): string {
  const names = peerNames.filter(Boolean);
  if (names.length <= 3) return names.join(', ');
  const first3 = names.slice(0, 3);
  const fourth = names[3] || '';
  const head = fourth.slice(0, 1) || '…';
  return `${first3.join(', ')}, ${head}....`;
}

function getThemeKey(themeOverride?: string | null, roomType?: string | null): ChatRoomType {
  const key = (themeOverride || roomType || 'dm') as ChatRoomType;
  return CHAT_THEMES[key] ? key : 'dm';
}

function normalizeChatThemeKey(value?: string | null): ChatRoomType | null {
  const key = String(value ?? '').trim().toLowerCase() as ChatRoomType;
  return key && CHAT_THEMES[key] ? key : null;
}

function resolveInitialChatThemeKey(params: any): ChatRoomType | null {
  const snapshot = params?.initialRoomSnapshot;

  return (
    normalizeChatThemeKey(params?.chatThemeKey) ||
    normalizeChatThemeKey(params?.themeOverride) ||
    normalizeChatThemeKey(firstSnapshotString(snapshot, 'chatThemeKey', 'chatThemeType', 'themeOverride', 'chat_theme_key', 'chat_theme_type', 'theme_override')) ||
    (firstSnapshotString(snapshot, 'roomType', 'type')
      ? getThemeKey(
          firstSnapshotString(snapshot, 'themeOverride', 'chatThemeKey', 'chatThemeType', 'theme_override', 'chat_theme_key', 'chat_theme_type'),
          firstSnapshotString(snapshot, 'roomType', 'type'),
        )
      : null)
  );
}

function emitChatRoomThemeUpdated(payload: {
  roomId: string | number | null | undefined;
  themeOverride: string | null;
  chatThemeKey: ChatRoomType;
  roomType?: string | null;
  roomSubtype?: string | null;
}) {
  const roomIdString = payload.roomId == null ? null : String(payload.roomId);
  const roomIdNumber = Number(payload.roomId);

  DeviceEventEmitter.emit('chat:room_theme_updated', {
    roomId: Number.isFinite(roomIdNumber) ? roomIdNumber : payload.roomId,
    roomIdString,
    themeOverride: payload.themeOverride,
    chatThemeKey: payload.chatThemeKey,
    roomType: payload.roomType ?? null,
    roomSubtype: payload.roomSubtype ?? null,
    updatedAt: Date.now(),
  });
}

function emitChatTranslationSettingsUpdated(payload: {
  roomId: string | number | null | undefined;
  autoTranslate: boolean;
  showTranslatedOnly: boolean;
  translationTier: TranslationTier;
  translationTone: TranslationTone;
  viewLang: string | null;
  preferredLang: string | null;
}) {
  const roomIdString = payload.roomId == null ? null : String(payload.roomId);
  const roomIdNumber = Number(payload.roomId);

  DeviceEventEmitter.emit('chat:translation_settings_updated', {
    roomId: Number.isFinite(roomIdNumber) ? roomIdNumber : payload.roomId,
    roomIdString,
    autoTranslate: payload.autoTranslate,
    auto_translate: payload.autoTranslate,
    showTranslatedOnly: payload.showTranslatedOnly,
    show_translated_only: payload.showTranslatedOnly,
    translationTier: payload.translationTier,
    translation_tier: payload.translationTier,
    translationTone: payload.translationTone,
    translation_tone: payload.translationTone,
    viewLang: payload.viewLang,
    view_lang: payload.viewLang,
    view_lang_override: payload.viewLang,
    preferredLang: payload.preferredLang,
    preferred_lang: payload.preferredLang,
    send_lang_override: payload.preferredLang,
    updatedAt: Date.now(),
  });
}

function ChatSettingStatusBars({
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

function getThemePreview(themeOverride?: string | null, roomType?: string | null) {
  const key = getThemeKey(themeOverride, roomType);
  const chatTheme = CHAT_THEMES[key] as any;

  const background = chatTheme.background || chatTheme.bg || '#F8F9FA';
  const myBubble = chatTheme.myBubble || '#111111';

  return {
    key,
    background,
    myBubble,
    myText: chatTheme.myText || '#FFFFFF',
    otherBubble: chatTheme.otherBubble || '#FFFFFF',
    otherText: chatTheme.otherText || '#111111',
    swatch: key === 'coonn_light' || key === 'coonn_dark' ? background : myBubble,
    swatchBorder: key === 'coonn_light'
      ? 'rgba(0,0,0,0.18)'
      : key === 'coonn_dark'
        ? 'rgba(255,255,255,0.34)'
        : null,
  };
}

function formatStartedDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}.${month}.${day}`;
}

function firstSnapshotString(snapshot: InitialRoomSnapshot | null | undefined, ...keys: (keyof InitialRoomSnapshot)[]) {
  for (const key of keys) {
    const value = snapshot?.[key];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) return text;
  }
  return null;
}

function firstSnapshotBoolean(snapshot: InitialRoomSnapshot | null | undefined, fallback: boolean, ...keys: (keyof InitialRoomSnapshot)[]) {
  for (const key of keys) {
    const value = snapshot?.[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const text = value.trim().toLowerCase();
      if (text === 'true' || text === '1' || text === 'yes') return true;
      if (text === 'false' || text === '0' || text === 'no') return false;
    }
  }
  return fallback;
}

function normalizeInitialMembers(value: unknown): Member[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, any>;
      const id = String(raw.id ?? raw.user_id ?? raw.userId ?? '').trim();
      if (!id) return null;

      const avatarUrl = asString(raw.avatar_url) || asString(raw.avatarUrl) || null;
      const rawAvatarUrl =
        asString(raw.raw_avatar_url) ||
        asString(raw.rawAvatarUrl) ||
        asString(raw.room_avatar_url) ||
        asString(raw.roomAvatarUrl) ||
        avatarUrl;

      return {
        id,
        nickname: String(raw.nickname ?? raw.name ?? chatStaticText('chat:unknown', '알 수 없음')).trim() || chatStaticText('chat:unknown', '알 수 없음'),
        avatar_url: avatarUrl,
        raw_avatar_url: rawAvatarUrl,
        avatar_visible: parseAvatarVisible(raw.avatar_visible ?? raw.avatarVisible ?? raw.room_avatar_visible ?? raw.roomAvatarVisible, true),
        open_profile_id: asString(raw.open_profile_id) || asString(raw.openProfileId),
        status_message: asString(raw.status_message) || asString(raw.statusMessage) || asString(raw.room_status_message) || asString(raw.roomStatusMessage),
        is_me: Boolean(raw.is_me ?? raw.isMe),
        role: typeof raw.role === 'string' ? raw.role : null,
      } satisfies Member;
    })
    .filter(Boolean) as Member[];
}

function buildInitialInfo(snapshot: InitialRoomSnapshot | null | undefined) {
  if (!snapshot) return {};

  const baseTitle = firstSnapshotString(snapshot, 'baseTitle', 'title', 'roomTitle') || chatStaticText('chat:chat_room_title', '채팅방');
  const displayTitle = firstSnapshotString(snapshot, 'roomName', 'room_name', 'title', 'roomTitle') || baseTitle;

  return {
    roomType: firstSnapshotString(snapshot, 'roomType', 'type'),
    roomSubtype: firstSnapshotString(snapshot, 'roomSubtype', 'subtype'),
    roomCover: firstSnapshotString(snapshot, 'roomAvatarUrl', 'room_avatar_url', 'roomCover', 'coverImageUrl', 'cover_image_url', 'avatarUrl', 'avatar_url'),
    use_default_cover: Boolean(snapshot.useDefaultCover ?? snapshot.use_default_cover),
    joined_at: firstSnapshotString(snapshot, 'joinedAt', 'joined_at'),
    startedAt: firstSnapshotString(snapshot, 'startedAt', 'createdAt', 'joinedAt', 'joined_at'),
    baseTitle,
    displayTitle,
    room_name: firstSnapshotString(snapshot, 'roomName', 'room_name'),
  };
}

const themeList: { key: ChatThemeKey; label: string; color: string }[] = [
  { key: 'default', label: '기본', color: '#E5E7EB' },
  { key: 'self', label: 'Sage', color: CHAT_THEMES.self.myBubble },
  { key: 'dm', label: 'Blue', color: CHAT_THEMES.dm.myBubble },
  { key: 'group', label: 'Teal', color: CHAT_THEMES.group.myBubble },
  { key: 'business_dm', label: 'Navy', color: CHAT_THEMES.business_dm.myBubble },
  { key: 'open', label: 'Terracotta', color: CHAT_THEMES.open.myBubble },
  { key: 'beacon', label: 'Violet', color: CHAT_THEMES.beacon.myBubble },
  { key: 'coonn_light', label: 'CO·ONN Light', color: CHAT_THEMES.coonn_light.background },
  { key: 'coonn_dark', label: 'CO·ONN Dark', color: CHAT_THEMES.coonn_dark.background },
];

function getSoundLabel(sound: string, t: ReturnType<typeof useTranslation>['t']): string {
  switch (sound) {
    case '기본음':
      return t('chat:settings.sound.default');
    case '맑은 알림':
      return t('chat:settings.sound.clear');
    case '잔잔한 알림':
      return t('chat:settings.sound.calm');
    case '짧은 알림':
      return t('chat:settings.sound.short');
    case '부드러운 알림':
      return t('chat:settings.sound.soft');
    case '조용한 알림':
      return t('chat:settings.sound.quiet');
    case '깊은 알림':
      return t('chat:settings.sound.deep');
    case '가벼운 알림':
      return t('chat:settings.sound.light');
    case '무음':
      return t('chat:settings.sound.mute');
    default:
      return sound;
  }
}

function ThemePreviewCard({
  preview,
  ui,
}: {
  preview: ReturnType<typeof getThemePreview>;
  ui: ChatSettingTheme;
}) {
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.themePreviewCard,
        {
          backgroundColor: ui.previewPhoneBackground,
          borderColor: ui.border,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.preview,
        },
      ]}
    >
      <View style={styles.themePreviewTop}>
        <View style={[styles.themePreviewAvatar, { backgroundColor: ui.previewSkeleton }]} />
        <View style={[styles.themePreviewTitle, { backgroundColor: ui.previewSkeleton }]} />
      </View>

      <View
        style={[
          styles.themePreviewWindow,
          {
            backgroundColor: preview.background,
            borderRadius: ui.radius.preview,
          },
        ]}
      >
        <View
          style={[
            styles.previewBubble,
            styles.previewOtherBubble,
            {
              backgroundColor: preview.otherBubble,
              borderRadius: ui.radius.previewBubble,
            },
          ]}
        >
          <Text style={[styles.previewBubbleText, { color: preview.otherText }]}>{t('chat:settings.themePreview.other')}</Text>
        </View>

        <View
          style={[
            styles.previewBubble,
            styles.previewMyBubble,
            {
              backgroundColor: preview.myBubble,
              borderRadius: ui.radius.previewBubble,
            },
          ]}
        >
          <Text style={[styles.previewBubbleText, { color: preview.myText }]}>{t('chat:settings.themePreview.mine')}</Text>
        </View>

        <View
          style={[
            styles.themePreviewInput,
            {
              backgroundColor: ui.previewInput,
              borderColor: ui.previewInputBorder,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.button,
            },
          ]}
        >
          <View style={[styles.themePreviewInputLine, { backgroundColor: ui.previewSkeleton }]} />
        </View>
      </View>
    </View>
  );
}

const SoundModal = ({
  visible,
  onClose,
  selectedSound,
  onSelect,
  ui,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  selectedSound: string;
  onSelect: (sound: string) => void;
  ui: ChatSettingTheme;
  bottomInset: number;
}) => {
  const { t } = useTranslation();
  const sounds = ['기본음', '맑은 알림', '잔잔한 알림', '짧은 알림', '부드러운 알림', '조용한 알림', '깊은 알림', '가벼운 알림', '무음'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[styles.bottomSheetOverlay, { backgroundColor: ui.backdrop }]} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.bottomSheetContent,
            {
              backgroundColor: ui.surface,
              borderTopLeftRadius: ui.radius.sheet,
              borderTopRightRadius: ui.radius.sheet,
              paddingBottom: bottomInset > 0 ? bottomInset + 16 : 34,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.sheetHandleWrap}
            onPress={onClose}
            activeOpacity={0.72}
            hitSlop={{ top: 12, bottom: 12, left: 48, right: 48 }}
          >
            <View style={[styles.sheetHandle, { backgroundColor: ui.sheetHandle }]} />
          </TouchableOpacity>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: ui.textPrimary }]}>{t('chat:settings.sound.title')}</Text>
          </View>
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            {sounds.map((sound, idx) => {
              const selected = selectedSound === sound;
              return (
                <TouchableOpacity
                  key={sound}
                  style={[
                    styles.sheetRow,
                    selected && { backgroundColor: ui.rowPressed },
                    idx > 0 && { borderTopColor: ui.divider, borderTopWidth: ui.hairline },
                  ]}
                  onPress={() => onSelect(sound)}
                  activeOpacity={0.72}
                >
                  <Text
                    style={[
                      styles.sheetRowText,
                      { color: selected ? ui.controlSelected : ui.textSecondary },
                      selected && styles.activeText,
                    ]}
                  >
                    {getSoundLabel(sound, t)}
                  </Text>
                  {selected && <Check size={19} color={ui.controlSelected} strokeWidth={2.2} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.sheetCloseBtn} onPress={onClose} activeOpacity={0.72}>
            <Text style={[styles.sheetCloseText, { color: ui.textSecondary }]}>{t('common:close')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const ThemeModal = ({
  visible,
  onClose,
  currentTheme,
  roomType,
  onSelect,
  ui,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  currentTheme?: string | null;
  roomType?: string | null;
  onSelect: (key: string | null) => void;
  ui: ChatSettingTheme;
  bottomInset: number;
}) => {
  const { t } = useTranslation();
  const activeKey = currentTheme || 'default';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[styles.bottomSheetOverlay, { backgroundColor: ui.backdrop }]} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.bottomSheetContent,
            {
              backgroundColor: ui.surface,
              borderTopLeftRadius: ui.radius.sheet,
              borderTopRightRadius: ui.radius.sheet,
              paddingBottom: bottomInset > 0 ? bottomInset + 16 : 34,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.sheetHandleWrap}
            onPress={onClose}
            activeOpacity={0.72}
            hitSlop={{ top: 12, bottom: 12, left: 48, right: 48 }}
          >
            <View style={[styles.sheetHandle, { backgroundColor: ui.sheetHandle }]} />
          </TouchableOpacity>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: ui.textPrimary }]}>{t('chat:settings.theme.title')}</Text>
          </View>
          <ScrollView style={styles.themeSheetScroll} showsVerticalScrollIndicator={false}>
            {themeList.map((item, idx) => {
              const isSelected = activeKey === item.key;
              const preview = item.key === 'default' ? getThemePreview(null, roomType) : getThemePreview(item.key, roomType);

              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.sheetRow, idx > 0 && { borderTopColor: ui.divider, borderTopWidth: ui.hairline }]}
                  activeOpacity={0.72}
                  onPress={() => onSelect(item.key === 'default' ? null : item.key)}
                >
                  <View style={styles.themeOptionLeft}>
                    <View
                      style={[
                        styles.colorPreviewCircle,
                        {
                          backgroundColor: preview.swatch || item.color,
                          borderColor: preview.swatchBorder ?? ui.border,
                          borderWidth: ui.hairline,
                          borderRadius: ui.radius.colorDot,
                        },
                      ]}
                    />
                    <View style={styles.themeOptionTextBox}>
                      <Text style={[styles.sheetRowText, { color: isSelected ? ui.textPrimary : ui.textSecondary }, isSelected && styles.activeText]}>
                        {item.key === 'default' ? t('chat:settings.theme.default') : item.label}
                      </Text>
                      {item.key === 'default' && (
                        <Text style={[styles.themeOptionSub, { color: ui.textDisabled }]}>{t('chat:settings.theme.byRoomType')}</Text>
                      )}
                    </View>
                  </View>
                  {isSelected && <Check size={19} color={ui.textPrimary} strokeWidth={2.2} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};


function colorWithAlpha(color: string | undefined | null, alpha: number) {
  const raw = String(color ?? '').trim();
  const safeAlpha = Math.max(0, Math.min(1, alpha));

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) {
    const hex = raw.slice(1);
    const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${safeAlpha})`;
  }

  const rgb = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) return `rgba(${parts[0]},${parts[1]},${parts[2]},${safeAlpha})`;
  }

  return safeAlpha >= 1 ? raw : 'rgba(0,0,0,0.06)';
}

function isAuthCancelledError(error: any) {
  const text = [
    error?.code,
    error?.name,
    error?.message,
    error?.reason,
    error?.details,
    typeof error === 'string' ? error : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    text.includes('cancel') ||
    text.includes('canceled') ||
    text.includes('cancelled') ||
    text.includes('user_cancel') ||
    text.includes('user_cancelled') ||
    text.includes('auth_cancel') ||
    text.includes('authentication_cancel') ||
    text.includes('인증이 취소') ||
    text.includes('취소')
  );
}

export default function ChatSettingScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params || {};
  const { roomId, initialRoomSnapshot, initialMembers } = params;
  const hasInitialSnapshot = Boolean(initialRoomSnapshot);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const initialChatThemeKey = useMemo(() => resolveInitialChatThemeKey(params), [params]);
  const [resolvedChatThemeKey, setResolvedChatThemeKey] = useState<ChatRoomType>(() => initialChatThemeKey ?? 'dm');
  const [themeReady, setThemeReady] = useState(() => Boolean(initialChatThemeKey));

  const chatTheme = useMemo(() => getChatTheme(resolvedChatThemeKey), [resolvedChatThemeKey]);
  const ui = useMemo(() => createChatSettingTheme(chatTheme, resolvedChatThemeKey), [chatTheme, resolvedChatThemeKey]);
  const { expoBarStyle } = useChatStatusBar({ navigation, headerBg: chatTheme.background });
  const systemBarsStyle = (expoBarStyle === 'dark' || (expoBarStyle as string) === 'dark-content') ? 'dark' : 'light';

  const initialMemberList = useMemo(() => normalizeInitialMembers(initialMembers), [initialMembers]);

  const [loading, setLoading] = useState(!hasInitialSnapshot);
  const [info, setInfo] = useState<any>(() => buildInitialInfo(initialRoomSnapshot));
  const [members, setMembers] = useState<Member[]>(() => initialMemberList);
  const [memberCount, setMemberCount] = useState(() => {
    const snapshotCount = Number(initialRoomSnapshot?.memberCount ?? 0);
    if (initialMemberList.length > 0) return initialMemberList.length;
    return Number.isFinite(snapshotCount) && snapshotCount > 0 ? snapshotCount : 1;
  });

  const [soundVisible, setSoundVisible] = useState(false);
  const [themeVisible, setThemeVisible] = useState(false);
  const [translateVisible, setTranslateVisible] = useState(false);
  const [selectedSound, setSelectedSound] = useState('기본음');
  const [leaveAlertVisible, setLeaveAlertVisible] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [exportAlertVisible, setExportAlertVisible] = useState(false);
  const [exportBusy, setExportBusy] = useState<'save' | 'share' | null>(null);
  const [secureBackupStatus, setSecureBackupStatus] = useState<SecureKeyBackupStatus>(EMPTY_SECURE_BACKUP_STATUS);
  const [secureBackupLoading, setSecureBackupLoading] = useState(false);
  const [secureBackupConfirmVisible, setSecureBackupConfirmVisible] = useState(false);
  const [secureBackupCodeVisible, setSecureBackupCodeVisible] = useState(false);
  const [secureBackupRecoveryCode, setSecureBackupRecoveryCode] = useState('');
  const [secureBackupCodeStored, setSecureBackupCodeStored] = useState(false);
  const [secureBackupCodeCopied, setSecureBackupCodeCopied] = useState(false);
  const [secureBackupCodeNotice, setSecureBackupCodeNotice] = useState<string | null>(null);
  const [secureBackupResultVisible, setSecureBackupResultVisible] = useState(false);
  const [secureBackupResultTitle, setSecureBackupResultTitle] = useState('');
  const [secureBackupResultMessage, setSecureBackupResultMessage] = useState('');
  const [secureBackupRestoreVisible, setSecureBackupRestoreVisible] = useState(false);
  const [secureBackupRestoreCode, setSecureBackupRestoreCode] = useState('');
  const [secureBackupRestoreError, setSecureBackupRestoreError] = useState<string | null>(null);
  const [secureBackupDeleteVisible, setSecureBackupDeleteVisible] = useState(false);
  const [secureRecoveryRequests, setSecureRecoveryRequests] = useState<SecurePeerRecoveryRequestList>(EMPTY_SECURE_RECOVERY_REQUESTS);
  const [secureRecoveryLoading, setSecureRecoveryLoading] = useState(false);
  const [secureNewKeyConfirmVisible, setSecureNewKeyConfirmVisible] = useState(false);
  const [secureHistoryRequestConfirmVisible, setSecureHistoryRequestConfirmVisible] = useState(false);
  const [secureHistoryApproveTarget, setSecureHistoryApproveTarget] = useState<SecurePeerRecoveryRequest | null>(null);
  const [secureHistoryRejectTarget, setSecureHistoryRejectTarget] = useState<SecurePeerRecoveryRequest | null>(null);
  const { toast: floatingToast, showToast: showFloatingToast, hideToast: hideFloatingToast } = useCoonnFloatingToast();

  const [autoTranslate, setAutoTranslate] = useState(() =>
    firstSnapshotBoolean(initialRoomSnapshot, true, 'autoTranslate', 'auto_translate'),
  );
  const [showTranslatedOnly, setShowTranslatedOnly] = useState(() =>
    firstSnapshotBoolean(initialRoomSnapshot, false, 'showTranslatedOnly', 'show_translated_only'),
  );
  const [userTier, setUserTier] = useState<TranslationTier>('free');
  const [translationTier, setTranslationTier] = useState<TranslationTier>(() =>
    normalizeTranslationTier(firstSnapshotString(initialRoomSnapshot, 'translationTier', 'translation_tier')),
  );
  const [translationTone, setTranslationTone] = useState<TranslationTone>(() =>
    normalizeTranslationTone(firstSnapshotString(initialRoomSnapshot, 'translationTone', 'translation_tone')),
  );
  const [viewLang, setViewLang] = useState<string | null>(() =>
    normalizeLangCode(firstSnapshotString(initialRoomSnapshot, 'viewLang', 'view_lang', 'view_lang_override')),
  );
  const [settingLang, setSettingLang] = useState<string | null>('ko');
  const [preferredLang, setPreferredLang] = useState<string | null>(() =>
    normalizeManualSendLang(firstSnapshotString(initialRoomSnapshot, 'preferredLang', 'preferred_lang', 'send_lang_override')),
  );
  const [peerViewLang, setPeerViewLang] = useState<string | null>(null);
  const [peerSettingLang, setPeerSettingLang] = useState<string | null>(null);

  const emitCurrentTranslationSettings = useCallback((patch: Partial<{
    autoTranslate: boolean;
    showTranslatedOnly: boolean;
    translationTier: TranslationTier;
    translationTone: TranslationTone;
    viewLang: string | null;
    preferredLang: string | null;
  }> = {}) => {
    emitChatTranslationSettingsUpdated({
      roomId,
      autoTranslate: patch.autoTranslate ?? autoTranslate,
      showTranslatedOnly: patch.showTranslatedOnly ?? showTranslatedOnly,
      translationTier: patch.translationTier ?? translationTier,
      translationTone: patch.translationTone ?? translationTone,
      viewLang: patch.viewLang ?? viewLang,
      preferredLang: patch.preferredLang ?? preferredLang,
    });
  }, [autoTranslate, preferredLang, roomId, showTranslatedOnly, translationTier, translationTone, viewLang]);

  useFocusEffect(
    useCallback(() => {
      void fetchData();
      void refreshSecureBackupStatus();
      void refreshSecureRecoveryRequests();

    }, [roomId]),
  );

  const fetchData = async () => {
    try {
      if (!hasInitialSnapshot) setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: myMem, error: memErr } = await supabase
        .from('chat_members')
        .select(CHAT_SETTING_MY_MEMBER_SELECT)
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .single();

      if (memErr) throw memErr;

      const { data: roomInfo } = await supabase
        .from('chat_rooms')
        .select('id, type, subtype, custom_title, cover_image_url, created_by, created_at')
        .eq('id', roomId)
        .single();

      const { isSelf, isDM, isGroup, isOpen, isBeacon } = classifyRoom(roomInfo?.type, roomInfo?.subtype);
      const serverType = String(roomInfo?.type ?? '').trim().toLowerCase();
      const serverSubtype = String(roomInfo?.subtype ?? '').trim().toLowerCase();
      const isBusinessDm = serverType === 'business_dm' || serverSubtype === 'business_dm';
      const currentRoomType = isBeacon ? 'beacon' : isOpen ? 'open' : isGroup ? 'group' : isSelf ? 'self' : 'dm';

      let memberRowsQuery = supabase
        .from('chat_members')
        .select('user_id, role, active, joined_at, left_at, open_profile_id, room_nickname, room_avatar_url, room_avatar_visible, room_status_message')
        .eq('room_id', roomId);

      // DM은 상대가 방을 나가도 내 채팅방 설정에서는 상대 정보와 인원수 2명이 유지되어야 한다.
      // active=false는 상대의 퇴장 상태일 뿐, 내 DM 화면에서 상대를 숨기는 조건이 아니다.
      if (currentRoomType !== 'dm') {
        memberRowsQuery = memberRowsQuery.eq('active', true);
      }

      const { data: memberRows } = await memberRowsQuery;

      const userIds = (memberRows || []).map((m: any) => m.user_id);
      setMemberCount(userIds.length || 1);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nickname, avatar_url, follow_id, setting_lang, view_lang, preferred_lang, translation_tier, translation_tone_default, user_tier')
        .in('user_id', userIds);

      const pMap = new Map<string, any>();
      (profiles || []).forEach((p: any) => pMap.set(p.user_id, p));

      const myProfile = pMap.get(user.id);
      const defaults = buildTranslationDefaults(myProfile);
      let roomSettings: RoomSettingsRow | null = null;
      try {
        roomSettings = await fetchRoomSettings(Number(roomId), user.id);
      } catch {
        roomSettings = null;
      }

      const translationConfig = buildTranslationConfig(roomSettings, defaults);
      setSettingLang(defaults.settingLang);
      setUserTier(defaults.userTier);
      setAutoTranslate(!!translationConfig.autoTranslate);
      setShowTranslatedOnly(!!translationConfig.showTranslatedOnly);
      setTranslationTier(translationConfig.translationTier);
      setTranslationTone(translationConfig.translationTone);
      setViewLang(translationConfig.viewLang);
      setPreferredLang(translationConfig.preferredLang);

      const useFriendAlias = !isBusinessDm && (currentRoomType === 'dm' || currentRoomType === 'group');
      const friendAliasMap = useFriendAlias
        ? await loadViewerFriendAliasMap(user.id, userIds)
        : new Map<string, string | null>();

      const parsedMembers: Member[] = (memberRows || []).map((m: any) => {
        const userId = String(m?.user_id ?? '').trim();
        const p = pMap.get(userId);
        const openProfileRoom = isOpenRoomKind(currentRoomType);
        const roomNickname = asString(m?.room_nickname);
        const rawRoomAvatarUrl = asString(m?.room_avatar_url);
        const roomAvatarVisible = parseAvatarVisible(m?.room_avatar_visible, true);
        const profileNickname = asString(p?.nickname);
        const profileFollowId = asString(p?.follow_id);
        const profileAvatarUrl = asString(p?.avatar_url);
        const fallbackName = t('chat:unknown', { defaultValue: '알 수 없음' });
        const displayAvatarUrl = resolveChatAvatarUrl({
          roomType: currentRoomType,
          roomAvatarUrl: rawRoomAvatarUrl,
          roomAvatarVisible,
          profileAvatarUrl,
        });

        return {
          id: userId,
          nickname: useFriendAlias && userId !== user.id
            ? resolvePersonDisplayName({
                alias: friendAliasMap.has(userId) ? friendAliasMap.get(userId) ?? null : null,
                nickname: profileNickname,
                follow_id: profileFollowId,
                isFriendByMe: friendAliasMap.has(userId),
                context: 'chat',
                fallback: fallbackName,
              })
            : resolveChatDisplayName({
                roomType: currentRoomType,
                roomNickname,
                profileNickname,
              }) || fallbackName,
          avatar_url: displayAvatarUrl,
          raw_avatar_url: openProfileRoom ? rawRoomAvatarUrl : profileAvatarUrl,
          avatar_visible: openProfileRoom ? roomAvatarVisible : true,
          open_profile_id: asString(m?.open_profile_id),
          status_message: openProfileRoom ? asString(m?.room_status_message) : null,
          is_me: userId === user.id,
          role: m.role || null,
        };
      });

      parsedMembers.sort((a: any, b: any) => {
        const ra = (memberRows || []).find((x: any) => x.user_id === a.id);
        const rb = (memberRows || []).find((x: any) => x.user_id === b.id);
        const ta = ra?.joined_at ? new Date(ra.joined_at).getTime() : 0;
        const tb = rb?.joined_at ? new Date(rb.joined_at).getTime() : 0;
        return ta - tb;
      });

      setMembers(parsedMembers);
      const canEditOpenProfile = canManageOpenChatProfile({
        isOpen,
        ownerId: roomInfo?.created_by ?? null,
        myId: user.id,
        role: myMem?.role ?? null,
      });
      const others = parsedMembers.filter((m) => !m.is_me);
      const peerProfile = others[0]?.id ? pMap.get(others[0].id) : null;
      setPeerViewLang(normalizeLangCode(peerProfile?.view_lang ?? null));
      setPeerSettingLang(normalizeLangCode(peerProfile?.setting_lang ?? null));

      let baseTitle = roomInfo?.custom_title || '';

      if (isSelf) baseTitle = t('chat:chat_with_me');
      else if (isDM) baseTitle = roomInfo?.custom_title || others[0]?.nickname || t('chat:unknown', { defaultValue: '알 수 없음' });
      else if (isGroup) baseTitle = roomInfo?.custom_title || buildGroupTitle(others.map((o) => o.nickname)) || t('chat:group_chat_title', { defaultValue: '그룹채팅' });
      else if (isOpen) baseTitle = roomInfo?.custom_title || t('chat:open_chat_title', { defaultValue: '오픈채팅' });
      else baseTitle = roomInfo?.custom_title || t('chat:chat_room_title', { defaultValue: '채팅방' });

      const displayTitle = myMem?.room_name || baseTitle;

      const fetchedChatThemeKey = getThemeKey(myMem?.theme_override, roomInfo?.type);
      setResolvedChatThemeKey(fetchedChatThemeKey);
      setThemeReady(true);

      setInfo({
        ...myMem,
        myId: user.id,
        roomType: roomInfo?.type,
        roomSubtype: roomInfo?.subtype,
        roomCover: isGroup && !myMem?.use_default_cover && asString(myMem?.room_avatar_url)
          ? asString(myMem?.room_avatar_url)
          : roomInfo?.cover_image_url || null,
        roomOwnerId: roomInfo?.created_by || null,
        canEditOpenProfile,
        startedAt: roomInfo?.created_at || myMem?.joined_at || null,
        baseTitle,
        displayTitle,
      });
    } catch {
      if (!themeReady) {
        setResolvedChatThemeKey(initialChatThemeKey ?? 'dm');
        setThemeReady(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderCover = () => {
    const classifiedRoom = classifyRoom(info.roomType, info.roomSubtype);

    if (!classifiedRoom.isDM && info.use_default_cover) {
      return (
        <View
          style={[
            styles.avatar,
            styles.hiddenAvatar,
            {
              backgroundColor: ui.surfaceRaised,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.avatar,
            },
          ]}
        >
          <View style={[styles.hiddenAvatarMark, { backgroundColor: ui.surfaceSubtle, borderRadius: ui.radius.smallAvatar }]} />
        </View>
      );
    }

    const { isSelf, isDM, isGroup, isOpen } = classifiedRoom;
    const me = members.find((m) => m.is_me);
    const others = members.filter((m) => !m.is_me);

    const imageStyle: ImageStyle = {
      width: 70,
      height: 70,
      backgroundColor: ui.surfaceRaised,
      borderColor: ui.border,
      borderWidth: ui.hairline,
      borderRadius: ui.radius.avatar,
    };

    if (isSelf && me?.avatar_url) return <Image source={{ uri: me.avatar_url }} style={imageStyle} />;
    if (isDM && others[0]?.avatar_url) return <Image source={{ uri: others[0].avatar_url }} style={imageStyle} />;
    if (!isSelf && !isDM && info.roomCover) return <Image source={{ uri: info.roomCover }} style={imageStyle} />;

    if (isGroup) {
      const targets = others.slice(0, 3).filter((x) => !!x.avatar_url);
      if (targets.length === 1) return <Image source={{ uri: targets[0].avatar_url as string }} style={imageStyle} />;
      if (targets.length >= 2) {
        return (
          <View style={[styles.avatar, styles.stackWrap, { backgroundColor: ui.surfaceRaised, borderColor: ui.border, borderWidth: ui.hairline, borderRadius: ui.radius.avatar }]}>
            <Image source={{ uri: targets[0].avatar_url as string }} style={[styles.stackImg as ImageStyle, styles.stackA as ImageStyle, { borderColor: ui.surface }]} />
            {targets[1] && <Image source={{ uri: targets[1].avatar_url as string }} style={[styles.stackImg as ImageStyle, styles.stackB as ImageStyle, { borderColor: ui.surface }]} />}
            {targets[2] && <Image source={{ uri: targets[2].avatar_url as string }} style={[styles.stackImg as ImageStyle, styles.stackC as ImageStyle, { borderColor: ui.surface }]} />}
          </View>
        );
      }
    }

    if (me?.avatar_url) return <Image source={{ uri: me.avatar_url }} style={imageStyle} />;
    return <View style={[styles.avatar, styles.hiddenAvatar, { backgroundColor: ui.surfaceRaised, borderColor: ui.border, borderWidth: ui.hairline, borderRadius: ui.radius.avatar }]} />;
  };

  const handleGoEdit = () => {
    const { isGroup, isOpen } = classifyRoom(info.roomType, info.roomSubtype);
    navigation.navigate('ChatRoomEdit', {
      roomId,
      roomType: isGroup ? 'group' : isOpen ? 'open' : 'dm',
      initialName: info.room_name,
      baseTitle: info.baseTitle,
      initialImage: info.roomCover,
      useDefaultCover: !!info.use_default_cover,
      participants: members.filter((m) => !m.is_me).map((m) => m.avatar_url).filter(Boolean),
      chatThemeKey: resolvedChatThemeKey,
      themeOverride: resolvedChatThemeKey,
    });
  };

  const handleGoOpenProfileEdit = () => {
    if (!info.canEditOpenProfile || !roomId) return;
    navigation.navigate('OpenChatProfileEdit', {
      roomId: Number(roomId),
      initialTitle: info.baseTitle || info.displayTitle,
      initialCoverImageUrl: info.roomCover || null,
    });
  };

  const updateSettingAndSync = async (field: string, value: any) => {
    if (!info.myId || !roomId) return;
    try {
      await supabase
        .from('chat_members')
        .update({ [field]: value })
        .eq('room_id', roomId)
        .eq('user_id', info.myId);

      await syncChatRooms();
      setInfo((prev: any) => ({ ...prev, [field]: value }));
    } catch {}
  };

  const persistTranslationPatch = async (patch: Partial<RoomSettingsRow>) => {
    if (!info.myId || !roomId) return;

    await upsertRoomSettings(Number(roomId), info.myId, patch);

    const memberPatch: any = {};
    if (patch.auto_translate !== undefined) memberPatch.auto_translate = !!patch.auto_translate;
    if (patch.translation_tier !== undefined) memberPatch.translation_tier = normalizeTranslationTier(patch.translation_tier);
    if (patch.translation_tone !== undefined) memberPatch.translation_tone = normalizeTranslationTone(patch.translation_tone);
    if (patch.view_lang !== undefined) memberPatch.view_lang_override = normalizeLangCode(patch.view_lang) ?? 'KO';
    if (Object.prototype.hasOwnProperty.call(patch, 'preferred_lang')) {
      memberPatch.send_lang_override = normalizeManualSendLang((patch as any).preferred_lang);
    }

    if (Object.keys(memberPatch).length > 0) {
      try {
        await supabase
          .from('chat_members')
          .update(memberPatch)
          .eq('room_id', roomId)
          .eq('user_id', info.myId);
      } catch {}
    }

    await syncChatRooms();
  };

  const handleToggleAutoTranslate = async () => {
    const next = !autoTranslate;
    setAutoTranslate(next);
    emitCurrentTranslationSettings({ autoTranslate: next });
    await persistTranslationPatch({ auto_translate: next });
  };

  const handleToggleShowTranslatedOnly = async () => {
    const next = !showTranslatedOnly;
    setShowTranslatedOnly(next);
    emitCurrentTranslationSettings({ showTranslatedOnly: next });
    await persistTranslationPatch({ show_translated_only: next });
  };

  const handleChangeTranslationTier = async (tier: TranslationTier) => {
    const next = normalizeTranslationTier(tier);
    setTranslationTier(next);
    emitCurrentTranslationSettings({ translationTier: next });
    await persistTranslationPatch({ translation_tier: next });
  };

  const handleChangeTranslationTone = async (tone: TranslationTone) => {
    const next = normalizeTranslationTone(tone);
    setTranslationTone(next);
    emitCurrentTranslationSettings({ translationTone: next });
    await persistTranslationPatch({ translation_tone: next });
  };

  const handleChangeViewLang = async (lang: string) => {
    const next = normalizeLangCode(lang) ?? 'KO';
    setViewLang(next);
    emitCurrentTranslationSettings({ viewLang: next });
    await persistTranslationPatch({ view_lang: next });

    try {
      if (info.myId) {
        await supabase.from('profiles').update({ view_lang: next }).eq('user_id', info.myId);
      }
    } catch {}
  };

  const handleChangePreferredLang = async (lang: string) => {
    const isAuto = isAutoSendLang(lang);
    const next = isAuto ? null : normalizeManualSendLang(lang);
    setPreferredLang(next);

    await upsertRoomSettings(Number(roomId), info.myId, { preferred_lang: next });

    try {
      const sendOverride = isAuto ? (peerViewLang || peerSettingLang || null) : next;
      await supabase
        .from('chat_members')
        .update({ send_lang_override: sendOverride })
        .eq('room_id', roomId)
        .eq('user_id', info.myId);
    } catch {}

    await syncChatRooms();
  };

  const translationSummary = useMemo(
    () => summarizeTranslationSettings({ autoTranslate, showTranslatedOnly, viewLang, settingLang, preferredLang }),
    [autoTranslate, preferredLang, settingLang, showTranslatedOnly, viewLang],
  );

  // Theme selector state must not briefly fall back to "default" while
  // room settings are still being fetched. The screen background already uses
  // resolvedChatThemeKey from navigation; the selector should use the same
  // optimistic key until the server value is actually loaded. Once
  // info.theme_override exists, null intentionally means "default".
  const hasLoadedThemeOverride = Object.prototype.hasOwnProperty.call(info, 'theme_override');
  const settingThemeOverride = hasLoadedThemeOverride
    ? (normalizeChatThemeKey(info.theme_override) ?? null)
    : (initialChatThemeKey ?? null);

  const panelRoomType = useMemo<ChatRoomType>(() => getThemeKey(settingThemeOverride, info.roomType), [info.roomType, settingThemeOverride]);

  const handleThemeChange = async (themeKey: string | null) => {
    const nextThemeKey = getThemeKey(themeKey, info.roomType);

    setThemeVisible(false);
    setResolvedChatThemeKey(nextThemeKey);
    setThemeReady(true);
    setInfo((prev: any) => ({ ...prev, theme_override: themeKey }));

    emitChatRoomThemeUpdated({
      roomId,
      themeOverride: themeKey,
      chatThemeKey: nextThemeKey,
      roomType: info.roomType,
      roomSubtype: info.roomSubtype,
    });

    try {
      navigation.setParams?.({
        chatThemeKey: nextThemeKey,
        themeOverride: nextThemeKey,
        initialRoomSnapshot: {
          ...(params?.initialRoomSnapshot ?? initialRoomSnapshot ?? {}),
          roomId,
          chatThemeKey: nextThemeKey,
          chatThemeType: nextThemeKey,
          themeOverride: nextThemeKey,
          roomType: info.roomType,
          type: info.roomType,
          roomSubtype: info.roomSubtype,
          subtype: info.roomSubtype,
        },
      });
    } catch {}

    await updateSettingAndSync('theme_override', themeKey);

    emitChatRoomThemeUpdated({
      roomId,
      themeOverride: themeKey,
      chatThemeKey: nextThemeKey,
      roomType: info.roomType,
      roomSubtype: info.roomSubtype,
    });
  };


  const runExport = useCallback(
    async (mode: 'save' | 'share') => {
      const numericRoomId = Number(roomId);
      if (!Number.isFinite(numericRoomId) || numericRoomId <= 0 || exportBusy) return;

      try {
        setExportBusy(mode);
        const fileUri = await exportRoomConversation(Math.trunc(numericRoomId));

        if (mode === 'save') {
          await saveExportFile(fileUri);
          showFloatingToast({
            message: t('chat:settings.export.saveSuccess'),
            tone: 'success',
            showMark: true,
          });
          return;
        }

        await shareExportFile(fileUri);
        showFloatingToast({
          message: t('chat:settings.export.shareSuccess'),
          tone: 'success',
          showMark: true,
        });
      } catch (error: any) {
        const code = String(error?.message ?? error ?? '');
        showFloatingToast({
          message: code === 'save_cancelled' ? t('chat:settings.export.saveCancelled') : t('chat:settings.export.fail'),
          tone: code === 'save_cancelled' ? 'info' : 'danger',
          showMark: true,
        });
      } finally {
        setExportBusy(null);
      }
    },
    [exportBusy, roomId, showFloatingToast, t],
  );

  const askExport = useCallback(() => {
    if (exportBusy) return;
    setExportAlertVisible(true);
  }, [exportBusy]);

  const handleSoundChange = (sound: string) => {
    setSelectedSound(sound);
    setSoundVisible(false);
  };

  const refreshSecureBackupStatus = async () => {
    try {
      const status = await secureRuntimeStore.getSecureKeyBackupStatus();
      setSecureBackupStatus(status);
    } catch {
      setSecureBackupStatus(EMPTY_SECURE_BACKUP_STATUS);
    }
  };


  const refreshSecureRecoveryRequests = async () => {
    const numericRoomId = Number(roomId);
    if (!Number.isFinite(numericRoomId) || numericRoomId <= 0) {
      setSecureRecoveryRequests(EMPTY_SECURE_RECOVERY_REQUESTS);
      return;
    }
    try {
      const list = await secureRuntimeStore.listRoomHistoryKeyRequests(numericRoomId);
      setSecureRecoveryRequests(list);
    } catch {
      setSecureRecoveryRequests(EMPTY_SECURE_RECOVERY_REQUESTS);
    }
  };

  const getSecureRecoveryMemberName = useCallback((userId?: string | null) => {
    if (!userId) return t('chat:settings.secure.peer');
    const found = members.find((m) => m.id === userId);
    if (found?.is_me) return t('chat:settings.secure.me');
    return found?.nickname || t('chat:settings.secure.peer');
  }, [members, t]);

  const showSecureResult = useCallback((title: string, message: string) => {
    setSecureBackupResultTitle(title);
    setSecureBackupResultMessage(message);
    setSecureBackupResultVisible(true);
  }, []);

  const showSecureFloatingNotice = useCallback((message: string) => {
    showFloatingToast({
      message,
      tone: 'default',
      showMark: false,
    });
  }, [showFloatingToast]);

  const clearSecureAttention = useCallback(async (reason: string) => {
    const numericRoomId = Number(roomId);
    if (!Number.isFinite(numericRoomId) || numericRoomId <= 0) return;

    try {
      const { error } = await supabase.rpc('clear_room_secure_attention', {
        p_room_id: numericRoomId,
      });

      if (error) {
        console.warn('[chat-setting][clear_secure_attention_failed]', {
          reason,
          message: error.message,
        });
      }
    } catch (error: any) {
      console.warn('[chat-setting][clear_secure_attention_failed]', {
        reason,
        message: String(error?.message ?? error),
      });
    }
  }, [roomId]);

  const handleCreateOrUpdateSecureBackup = async () => {
    setSecureBackupConfirmVisible(false);
    if (secureBackupLoading) return;
    try {
      setSecureBackupLoading(true);
      const result = await secureRuntimeStore.createOrUpdateSecureKeyBackup();
      setSecureBackupRecoveryCode(result.recoveryCode);
      setSecureBackupCodeStored(false);
      setSecureBackupCodeCopied(false);
      setSecureBackupCodeNotice(null);
      setSecureBackupCodeVisible(true);
      await refreshSecureBackupStatus();
    } catch (error: any) {
      if (isAuthCancelledError(error)) {
        showSecureFloatingNotice(t('chat:settings.secure.authCancelled'));
        return;
      }
      setSecureBackupResultTitle(t('chat:settings.secure.backupFailTitle'));
      setSecureBackupResultMessage(String(error?.message ?? error ?? t('chat:settings.secure.backupCreateFail')));
      setSecureBackupResultVisible(true);
    } finally {
      setSecureBackupLoading(false);
    }
  };

  const handleRestoreSecureBackup = async () => {
    if (secureBackupLoading) return;
    const code = secureBackupRestoreCode.trim();
    if (!code) {
      setSecureBackupRestoreError(t('chat:settings.secure.restoreCodeRequired'));
      return;
    }
    try {
      setSecureBackupLoading(true);
      setSecureBackupRestoreError(null);
      const result = await secureRuntimeStore.restoreSecureKeyBackup({ recoveryCode: code });
      setSecureBackupRestoreVisible(false);
      setSecureBackupRestoreCode('');
      setSecureBackupRestoreError(null);
      await refreshSecureBackupStatus();
      setSecureBackupResultTitle(t('chat:settings.secure.restoreSuccessTitle'));
      setSecureBackupResultMessage(t('chat:settings.secure.restoreSuccessMessage', { imported: result.imported, skipped: result.skipped, conflicts: result.conflicts ?? 0, conflictText: result.conflicts ? t('chat:settings.secure.conflictText', { conflicts: result.conflicts }) : '' }));
      setSecureBackupResultVisible(true);
    } catch (error: any) {
      if (isAuthCancelledError(error)) {
        setSecureBackupRestoreError(null);
        showSecureFloatingNotice(t('chat:settings.secure.authCancelled'));
        return;
      }
      setSecureBackupRestoreError(String(error?.message ?? error ?? t('chat:settings.secure.restoreFail')));
    } finally {
      setSecureBackupLoading(false);
    }
  };

  const handleCopySecureBackupRecoveryCode = async () => {
    const code = secureBackupRecoveryCode.trim();
    if (!code) return;

    try {
      await Clipboard.setStringAsync(code);
      setSecureBackupCodeCopied(true);
      setSecureBackupCodeStored(true);
      setSecureBackupCodeNotice(t('chat:settings.secure.codeCopied'));
    } catch {
      setSecureBackupCodeNotice(t('chat:settings.secure.codeCopyFail'));
    }
  };

  const handleCloseSecureBackupCodeModal = () => {
    if (!secureBackupCodeStored && !secureBackupCodeCopied) {
      setSecureBackupCodeNotice(t('chat:settings.secure.codeConfirmRequired'));
      return;
    }

    setSecureBackupCodeVisible(false);
    setSecureBackupRecoveryCode('');
    setSecureBackupCodeStored(false);
    setSecureBackupCodeCopied(false);
    setSecureBackupCodeNotice(null);
  };

  const handleDeleteSecureBackup = async () => {
    setSecureBackupDeleteVisible(false);
    if (secureBackupLoading) return;
    try {
      setSecureBackupLoading(true);
      await secureRuntimeStore.deleteSecureKeyBackup();
      await refreshSecureBackupStatus();
      setSecureBackupResultTitle(t('chat:settings.secure.backupDeleteSuccessTitle'));
      setSecureBackupResultMessage(t('chat:settings.secure.backupDeleteSuccessMessage'));
      setSecureBackupResultVisible(true);
    } catch (error: any) {
      if (isAuthCancelledError(error)) {
        showSecureFloatingNotice(t('chat:settings.secure.authCancelled'));
        return;
      }
      setSecureBackupResultTitle(t('chat:settings.secure.backupDeleteFailTitle'));
      setSecureBackupResultMessage(String(error?.message ?? error ?? t('chat:settings.secure.backupDeleteFail')));
      setSecureBackupResultVisible(true);
    } finally {
      setSecureBackupLoading(false);
    }
  };


  const handleCreateNewSecureRoomKey = async () => {
    setSecureNewKeyConfirmVisible(false);
    if (secureRecoveryLoading) return;
    const numericRoomId = Number(roomId);
    if (!Number.isFinite(numericRoomId) || numericRoomId <= 0) return;
    try {
      setSecureRecoveryLoading(true);
      const result = await secureRuntimeStore.createNewRoomSecureEpoch({ roomId: numericRoomId });
      showSecureResult(t('chat:settings.secure.newKeySuccessTitle'), t('chat:settings.secure.newKeySuccessMessage', { epoch: result.epoch }));
      await refreshSecureRecoveryRequests();
    } catch (error: any) {
      if (isAuthCancelledError(error)) {
        showSecureFloatingNotice(t('chat:settings.secure.authCancelled'));
        return;
      }
      showSecureResult(t('chat:settings.secure.newKeyFailTitle'), String(error?.message ?? error ?? t('chat:settings.secure.newKeyFail')));
    } finally {
      setSecureRecoveryLoading(false);
    }
  };

  const handleRequestHistorySecureKeys = async () => {
    setSecureHistoryRequestConfirmVisible(false);
    if (secureRecoveryLoading) return;
    const numericRoomId = Number(roomId);
    if (!Number.isFinite(numericRoomId) || numericRoomId <= 0) return;
    try {
      setSecureRecoveryLoading(true);
      const result = await secureRuntimeStore.requestRoomHistoryKeys({ roomId: numericRoomId });
      await refreshSecureRecoveryRequests();
      showSecureResult(t('chat:settings.secure.historyRequestSuccessTitle'), result.requestedCount > 0 ? t('chat:settings.secure.historyRequestSuccessMessage', { count: result.requestedCount }) : t('chat:settings.secure.historyRequestEmpty'));
    } catch (error: any) {
      if (isAuthCancelledError(error)) {
        showSecureFloatingNotice(t('chat:settings.secure.authCancelled'));
        return;
      }
      showSecureResult(t('chat:settings.secure.historyRequestFailTitle'), String(error?.message ?? error ?? t('chat:settings.secure.historyRequestFail')));
    } finally {
      setSecureRecoveryLoading(false);
    }
  };

  const handleApproveHistorySecureKeys = async () => {
    const target = secureHistoryApproveTarget;
    setSecureHistoryApproveTarget(null);
    if (!target || secureRecoveryLoading) return;
    const numericRoomId = Number(roomId);
    if (!Number.isFinite(numericRoomId) || numericRoomId <= 0) return;
    try {
      setSecureRecoveryLoading(true);
      const result = await secureRuntimeStore.approveRoomHistoryKeyRequest({ roomId: numericRoomId, requestId: target.id });
      void result;
      await clearSecureAttention('approve_history_keys');
      await refreshSecureRecoveryRequests();
      showSecureResult(t('chat:settings.secure.historyShareSuccessTitle'), t('chat:settings.secure.historyShareSuccessMessage', { name: getSecureRecoveryMemberName(target.requesterUserId) }));
    } catch (error: any) {
      if (isAuthCancelledError(error)) {
        showSecureFloatingNotice(t('chat:settings.secure.authCancelled'));
        return;
      }
      showSecureResult(t('chat:settings.secure.historyShareFailTitle'), String(error?.message ?? error ?? t('chat:settings.secure.historyShareFail')));
    } finally {
      setSecureRecoveryLoading(false);
    }
  };

  const handleRejectHistorySecureKeys = async () => {
    const target = secureHistoryRejectTarget;
    setSecureHistoryRejectTarget(null);
    if (!target || secureRecoveryLoading) return;
    try {
      setSecureRecoveryLoading(true);
      await secureRuntimeStore.rejectRoomHistoryKeyRequest({ requestId: target.id });
      await clearSecureAttention('reject_history_keys');
      await refreshSecureRecoveryRequests();
      showSecureResult(t('chat:settings.secure.rejectSuccessTitle'), t('chat:settings.secure.rejectSuccessMessage', { name: getSecureRecoveryMemberName(target.requesterUserId) }));
    } catch (error: any) {
      showSecureResult(t('chat:settings.secure.rejectFailTitle'), String(error?.message ?? error ?? t('chat:settings.secure.rejectFail')));
    } finally {
      setSecureRecoveryLoading(false);
    }
  };

  const handleClaimApprovedHistorySecureKeys = async () => {
    if (secureRecoveryLoading) return;
    const numericRoomId = Number(roomId);
    if (!Number.isFinite(numericRoomId) || numericRoomId <= 0) return;
    try {
      setSecureRecoveryLoading(true);
      const result = await secureRuntimeStore.claimApprovedRoomHistoryKeys(numericRoomId);
      await clearSecureAttention('claim_approved_history_keys');
      await refreshSecureRecoveryRequests();
      showSecureResult(t('chat:settings.secure.claimSuccessTitle'), t('chat:settings.secure.claimSuccessMessage', { imported: result.imported, skipped: result.skipped, conflictText: result.conflicts ? t('chat:settings.secure.conflictShort', { conflicts: result.conflicts }) : '' }));
    } catch (error: any) {
      if (isAuthCancelledError(error)) {
        showSecureFloatingNotice(t('chat:settings.secure.authCancelled'));
        return;
      }
      showSecureResult(t('chat:settings.secure.claimFailTitle'), String(error?.message ?? error ?? t('chat:settings.secure.claimFail')));
    } finally {
      setSecureRecoveryLoading(false);
    }
  };

  const performLeave = async () => {
    if (leaveBusy) return;

    const numericRoomId = Number(roomId);
    if (!Number.isFinite(numericRoomId) || numericRoomId <= 0) {
      showFloatingToast({
        message: t('chat:settings.leave.fail', { defaultValue: '채팅방을 나가지 못했습니다.' }),
        tone: 'danger',
        showMark: true,
      });
      return;
    }

    const roomKind = classifyRoom(info.roomType, info.roomSubtype);
    if (roomKind.isSelf) {
      setLeaveAlertVisible(false);
      showFloatingToast({
        message: t('chat:settings.leave.selfBlocked', { defaultValue: '나와의 채팅은 나갈 수 없습니다.' }),
        tone: 'info',
        showMark: true,
      });
      return;
    }

    const nextRoomId = Math.trunc(numericRoomId);
    const visibleOnlyLeave = isVisibleOnlyLeaveRoomType(info.roomType, info.roomSubtype);

    try {
      setLeaveBusy(true);

      const leaveRpc = visibleOnlyLeave
        ? 'leave_dm_room_visible_v1'
        : 'leave_room';

      const { error } = await supabase.rpc(leaveRpc, {
        p_room_id: nextRoomId,
      });

      if (error) throw error;

      setLeaveAlertVisible(false);

      await removeLocalChatRoom(nextRoomId);

      const leftAt = Date.now();

      DeviceEventEmitter.emit('chat:room_left', {
        roomId: nextRoomId,
        roomIdString: String(nextRoomId),
        leftAt,
        source: 'chat_setting',
      });

      DeviceEventEmitter.emit('chat:list:refresh', {
        reason: visibleOnlyLeave ? 'dm_room_hide' : 'room_leave',
        roomId: nextRoomId,
        roomIdString: String(nextRoomId),
        leftAt,
        source: 'chat_setting',
      });

      await syncChatRooms({
        reason: visibleOnlyLeave ? 'dm_room_hide' : 'room_leave',
        force: true,
        minIntervalMs: 0,
      });

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            params: {
              screen: 'ChatList',
              params: { mode: 'personal' },
            },
          },
        ],
      });
    } catch {
      showFloatingToast({
        message: t('chat:settings.leave.fail', { defaultValue: '채팅방을 나가지 못했습니다.' }),
        tone: 'danger',
        showMark: true,
      });
    } finally {
      setLeaveBusy(false);
    }
  };

  const handleLeave = () => {
    if (leaveBusy) return;
    setLeaveAlertVisible(true);
  };

  const themePreview = useMemo(
    () => getThemePreview(settingThemeOverride, info.roomType),
    [settingThemeOverride, info.roomType],
  );

  const hasIncomingSecureHistoryRequests = secureRecoveryRequests.incoming.some((req) => req.status === 'pending' || req.status === 'approving');
  const hasApprovedOutgoingSecureHistoryRequests = secureRecoveryRequests.outgoing.some((req) => req.status === 'approved');
  const hasSecureAttention = hasIncomingSecureHistoryRequests || hasApprovedOutgoingSecureHistoryRequests;
  const secureAttentionAnim = React.useRef(new Animated.Value(0)).current;
  const secureAttentionColor = chatTheme.tintColor || ui.textPrimary;
  const floatingToastTheme = useMemo(
    () => createCoonnFloatingToastThemeFromChatSetting(ui, floatingToast.tone),
    [floatingToast.tone, ui],
  );
  const secureAttentionIconBg = colorWithAlpha(secureAttentionColor, 0.13);
  const secureAttentionIconRippleStyle = {
    opacity: secureAttentionAnim.interpolate({
      inputRange: [0, 0.62, 1],
      outputRange: [0.18, 0.06, 0],
    }),
    transform: [
      {
        scale: secureAttentionAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.48],
        }),
      },
    ],
  };
  React.useEffect(() => {
    if (!hasSecureAttention) {
      secureAttentionAnim.stopAnimation();
      secureAttentionAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(secureAttentionAnim, {
        toValue: 1,
        duration: 1450,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      { resetBeforeIteration: true },
    );

    loop.start();
    return () => loop.stop();
  }, [hasSecureAttention, secureAttentionAnim]);


  if (!themeReady) {
    return (
      <View style={[styles.loading, { backgroundColor: ui.background }]}>
        <ChatSettingStatusBars
          visible={isFocused}
          systemBarsStyle={systemBarsStyle}
          backgroundColor={ui.background}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: ui.background }]}>
        <ChatSettingStatusBars
          visible={isFocused}
          systemBarsStyle={systemBarsStyle}
          backgroundColor={ui.background}
        />
        <ActivityIndicator color={ui.textPrimary} />
        <RoomAccessGuardOverlay
          roomId={roomId}
          me={info?.myId ?? null}
          navigation={navigation}
          topInset={Math.max(insets.top, 0)}
          bottomInset={Math.max(insets.bottom, 0)}
        />
      </View>
    );
  }

  const { isSelf, isDM, isGroup, isOpen, isBeacon } = classifyRoom(info.roomType, info.roomSubtype);
  const showOpenProfileEdit = isOpen && Boolean(info.canEditOpenProfile);
  const startedDate = formatStartedDate(info.startedAt || info.joined_at);
  const leaveSecondaryText = isGroup
    ? t('chat:settings.leave.rejectInvite')
    : isOpen || isBeacon
      ? t('chat:settings.leave.reportAndLeave')
      : undefined;
  const leaveMessage = isGroup
    ? t('chat:settings.leave.groupMessage')
    : isOpen || isBeacon
      ? t('chat:settings.leave.reportMessage')
      : t('chat:settings.leave.defaultMessage');

  const secureBackupSummary = secureBackupStatus.exists
    ? t('chat:settings.secure.backupSummary', { rooms: secureBackupStatus.roomCount, keys: secureBackupStatus.keyCount })
    : t('chat:settings.secure.noBackup');
  const secureBackupPrimaryLabel = t('chat:settings.secure.backup');
  const secureBackupConfirmTitle = t('chat:settings.secure.backupConfirmTitle');
  const secureBackupConfirmMessage = secureBackupStatus.exists
    ? t('chat:settings.secure.backupReplaceMessage')
    : t('chat:settings.secure.backupCreateMessage');
  const secureBackupConfirmText = t('chat:settings.secure.backupAction');

  return (
    <SafeScreen
      backgroundColor={ui.background}
      includeTopInset={false}
      includeBottomInset
      style={[styles.container, { backgroundColor: ui.background }]}
      contentStyle={styles.safeContent}
    >
      <ChatSettingStatusBars
        visible={isFocused}
        systemBarsStyle={systemBarsStyle}
        backgroundColor={ui.background}
      />
      <View style={[styles.header, { backgroundColor: ui.background, height: 52 + insets.top, paddingTop: insets.top }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn} activeOpacity={0.72}>
            <ChevronLeft size={22} color={ui.headerIcon} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: ui.headerIcon }]} numberOfLines={1}>{t('chat:settings.title')}</Text>
        </View>

        <View style={styles.headerRight}>
          {showOpenProfileEdit ? (
            <TouchableOpacity
              onPress={handleGoOpenProfileEdit}
              hitSlop={10}
              style={styles.headerIconBtn}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel={t('chat:settings.openProfileEditAccessibility')}
            >
              <Edit3 size={18} color={ui.headerIcon} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.profileSection,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.pageCard,
            },
          ]}
        >
          <View style={styles.profileMainRow}>
            <View style={styles.avatarWrap}>{renderCover()}</View>

            <View style={styles.profileInfo}>
              <Text style={[styles.roomName, { color: ui.textPrimary }]} numberOfLines={1}>
                {info.displayTitle}
              </Text>

              <Text style={[styles.memberCount, { color: ui.textSecondary }]} numberOfLines={1}>
                {t('chat:settings.memberCount', { count: memberCount })}
              </Text>

              {!!startedDate && (
                <Text style={[styles.startedDate, { color: ui.textSecondary }]} numberOfLines={1}>
                  {t('chat:settings.startedAt', { date: startedDate })}
                </Text>
              )}
            </View>

            <View style={styles.profileEditColumn}>
              <TouchableOpacity
                style={[
                  styles.editBtn,
                  {
                    backgroundColor: ui.editButtonBackground,
                    borderRadius: ui.radius.button,
                    borderColor: ui.border,
                    borderWidth: ui.hairline,
                  },
                ]}
                onPress={handleGoEdit}
                activeOpacity={0.72}
              >
                <Text style={[styles.editBtnText, { color: ui.textSecondary }]}>{t('common:edit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.section,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.rowGroup,
            },
          ]}
        >
          <Text style={[styles.sectionHeader, { color: ui.textDisabled }]}>{t('chat:settings.title')}</Text>

          <TouchableOpacity style={styles.row} onPress={() => setThemeVisible(true)} activeOpacity={0.72}>
            <Text style={[styles.rowLabel, { color: ui.textPrimary }]}>{t('chat:settings.theme.title')}</Text>
            <View style={styles.rowRight}>
              <View
                style={[
                  styles.colorPreview,
                  {
                    backgroundColor: themePreview.swatch,
                    borderColor: themePreview.swatchBorder ?? ui.border,
                    borderWidth: ui.hairline,
                  },
                ]}
              />
              <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />
            </View>
          </TouchableOpacity>

          <ThemePreviewCard preview={themePreview} ui={ui} />

          <View style={[styles.divider, { backgroundColor: ui.divider }]} />

          <TouchableOpacity style={styles.row} onPress={() => setTranslateVisible(true)} activeOpacity={0.72}>
            <Text style={[styles.rowLabel, { color: ui.textPrimary }]}>{t('chat:settings.translation.title')}</Text>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: ui.textSecondary }]} numberOfLines={1}>{translationSummary}</Text>
              <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: ui.divider }]} />

          <TouchableOpacity style={styles.row} onPress={() => setSoundVisible(true)} activeOpacity={0.72}>
            <Text style={[styles.rowLabel, { color: ui.textPrimary }]}>{t('chat:settings.sound.title')}</Text>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: ui.textSecondary }]}>{getSoundLabel(selectedSound, t)}</Text>
              <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: ui.divider }]} />

          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: ui.textPrimary }]}>{t('chat:settings.inputLock')}</Text>
            <Switch
              value={info.is_input_locked || false}
              onValueChange={(v) => updateSettingAndSync('is_input_locked', v)}
              trackColor={{ false: ui.switchTrackOff, true: ui.switchTrackOn }}
              thumbColor={ui.switchThumb}
            />
          </View>
        </View>

        <View
          style={[
            styles.section,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.rowGroup,
            },
          ]}
        >
          <Text style={[styles.sectionHeader, { color: ui.textDisabled }]}>{t('chat:settings.secure.section')}</Text>

          <TouchableOpacity style={styles.row} onPress={() => setSecureNewKeyConfirmVisible(true)} activeOpacity={0.72} disabled={secureRecoveryLoading}>
            <View style={styles.rowTextBlock}>
              <Text style={[styles.rowLabel, { color: ui.textPrimary }]}>{t('chat:settings.secure.newKey')}</Text>
              <Text style={[styles.rowSubLabel, { color: ui.textDisabled }]} numberOfLines={1}>{t('chat:settings.secure.newKeyDesc')}</Text>
            </View>
            <View style={styles.rowRight}>
              {secureRecoveryLoading ? <ActivityIndicator size="small" color={ui.textSecondary} /> : <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />}
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: ui.divider }]} />

          <TouchableOpacity style={styles.row} onPress={() => setSecureHistoryRequestConfirmVisible(true)} activeOpacity={0.72} disabled={secureRecoveryLoading}>
            <View style={styles.rowTextBlock}>
              <Text style={[styles.rowLabel, { color: ui.textPrimary }]}>{t('chat:settings.secure.historyRequest')}</Text>
              <Text style={[styles.rowSubLabel, { color: ui.textDisabled }]} numberOfLines={1}>{t('chat:settings.secure.historyRequestDesc')}</Text>
            </View>
            <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />
          </TouchableOpacity>

          {hasApprovedOutgoingSecureHistoryRequests ? (
            <>
              <View style={[styles.divider, { backgroundColor: ui.divider }]} />
              <View style={styles.secureAttentionWrap}>
                <TouchableOpacity style={[styles.row, styles.secureAttentionRow]} onPress={handleClaimApprovedHistorySecureKeys} activeOpacity={0.72} disabled={secureRecoveryLoading}>
                  <View style={styles.rowTextBlock}>
                    <View style={styles.labelWithAttentionPill}>
                      <Text style={[styles.rowLabel, styles.secureAttentionTitle, { color: ui.textPrimary }]} numberOfLines={1}>{t('chat:settings.secure.claimApproved')}</Text>
                      <View style={styles.secureAttentionCheckSlot}>
                        <View style={styles.secureAttentionPillIconWrap}>
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.secureAttentionIconRipple,
                              { borderColor: secureAttentionColor },
                              secureAttentionIconRippleStyle,
                            ]}
                          />
                          <View style={[styles.secureAttentionPillIcon, { backgroundColor: secureAttentionIconBg }]}>
                            <Check size={11} color={secureAttentionColor} strokeWidth={2.6} />
                          </View>
                        </View>
                      </View>
                    </View>
                    <Text style={[styles.rowSubLabel, { color: ui.textDisabled }]} numberOfLines={1}>{t('chat:settings.secure.claimApprovedDesc')}</Text>
                  </View>
                  <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {hasIncomingSecureHistoryRequests ? (
            <>
              <View style={[styles.divider, { backgroundColor: ui.divider }]} />
              <View style={styles.secureRequestList}>
                {secureRecoveryRequests.incoming.filter((req) => req.status === 'pending' || req.status === 'approving').slice(0, 3).map((req) => (
                  <View key={`incoming-${req.id}`} style={styles.secureAttentionWrap}>
                    <View style={[styles.secureRequestRow, styles.secureAttentionRow]}>
                      <View style={styles.rowTextBlock}>
                        <View style={styles.labelWithAttentionPill}>
                          <Text style={[styles.rowLabel, styles.secureAttentionTitle, { color: ui.textPrimary }]} numberOfLines={1}>{t('chat:settings.secure.incomingRequestTitle', { name: getSecureRecoveryMemberName(req.requesterUserId) })}</Text>
                          <View style={styles.secureAttentionCheckSlot}>
                            <View style={styles.secureAttentionPillIconWrap}>
                              <Animated.View
                                pointerEvents="none"
                                style={[
                                  styles.secureAttentionIconRipple,
                                  { borderColor: secureAttentionColor },
                                  secureAttentionIconRippleStyle,
                                ]}
                              />
                              <View style={[styles.secureAttentionPillIcon, { backgroundColor: secureAttentionIconBg }]}>
                                <Check size={11} color={secureAttentionColor} strokeWidth={2.6} />
                              </View>
                            </View>
                          </View>
                        </View>
                        <Text style={[styles.rowSubLabel, { color: ui.textDisabled }]} numberOfLines={1}>{t('chat:settings.secure.shareApprovedDesc')}</Text>
                      </View>
                      <View style={styles.secureRequestActions}>
                        <TouchableOpacity style={[styles.secureRequestPill, { borderColor: ui.border, borderWidth: ui.hairline, borderRadius: ui.radius.button }]} onPress={() => setSecureHistoryRejectTarget(req)} activeOpacity={0.72} disabled={secureRecoveryLoading}>
                          <Text style={[styles.secureRequestPillText, { color: ui.textSecondary }]}>{t('chat:settings.secure.decline')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.secureRequestPill, { backgroundColor: ui.textPrimary, borderRadius: ui.radius.button }]} onPress={() => setSecureHistoryApproveTarget(req)} activeOpacity={0.82} disabled={secureRecoveryLoading}>
                          <Text style={[styles.secureRequestPillText, { color: ui.background }]}>{t('common:share')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>

        <View
          style={[
            styles.section,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.rowGroup,
            },
          ]}
        >
          <Text style={[styles.sectionHeader, { color: ui.textDisabled }]}>{t('chat:settings.secure.backupSection')}</Text>

          <TouchableOpacity style={styles.row} onPress={() => setSecureBackupConfirmVisible(true)} activeOpacity={0.72} disabled={secureBackupLoading}>
            <View style={styles.rowTextBlock}>
              <Text style={[styles.rowLabel, { color: ui.textPrimary }]}>{secureBackupPrimaryLabel}</Text>
              <Text style={[styles.rowSubLabel, { color: ui.textDisabled }]} numberOfLines={1}>{secureBackupSummary}</Text>
            </View>
            <View style={styles.rowRight}>
              {secureBackupLoading ? <ActivityIndicator size="small" color={ui.textSecondary} /> : <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />}
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: ui.divider }]} />

          <TouchableOpacity style={styles.row} onPress={() => { setSecureBackupRestoreCode(''); setSecureBackupRestoreError(null); setSecureBackupRestoreVisible(true); }} activeOpacity={0.72} disabled={secureBackupLoading || !secureBackupStatus.exists}>
            <View style={styles.rowTextBlock}>
              <Text style={[styles.rowLabel, { color: secureBackupStatus.exists ? ui.textPrimary : ui.textDisabled }]}>{t('chat:settings.secure.restore')}</Text>
              <Text style={[styles.rowSubLabel, { color: ui.textDisabled }]} numberOfLines={1}>{t('chat:settings.secure.restoreDesc')}</Text>
            </View>
            <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />
          </TouchableOpacity>

          {secureBackupStatus.exists ? (
            <>
              <View style={[styles.divider, { backgroundColor: ui.divider }]} />
              <TouchableOpacity style={styles.row} onPress={() => setSecureBackupDeleteVisible(true)} activeOpacity={0.72} disabled={secureBackupLoading}>
                <View style={styles.rowTextBlock}>
                  <Text style={[styles.rowLabel, { color: ui.danger }]}>{t('chat:settings.secure.deleteServerBackup')}</Text>
                  <Text style={[styles.rowSubLabel, { color: ui.textDisabled }]} numberOfLines={1}>{t('chat:settings.secure.deleteServerBackupDesc')}</Text>
                </View>
                <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        <View
          style={[
            styles.section,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.rowGroup,
            },
          ]}
        >
          <Text style={[styles.sectionHeader, { color: ui.textDisabled }]}>{t('chat:settings.data.section')}</Text>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ChatRoomData', { roomId, chatThemeKey: resolvedChatThemeKey, themeOverride: resolvedChatThemeKey })} activeOpacity={0.72}>
            <Text style={[styles.rowLabel, { color: ui.textPrimary }]}>{t('chat:settings.data.manage')}</Text>
            <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: ui.divider }]} />

          <TouchableOpacity style={styles.row} onPress={askExport} activeOpacity={0.72} disabled={!!exportBusy}>
            <Text style={[styles.rowLabel, { color: exportBusy ? ui.textDisabled : ui.textPrimary }]}>{t('chat:settings.export.title')}</Text>
            <View style={styles.rowRight}>
              {exportBusy ? (
                <ActivityIndicator size="small" color={ui.textDisabled} />
              ) : (
                <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.leaveButton, { backgroundColor: ui.dangerBackground, borderRadius: ui.radius.rowGroup }, leaveBusy ? { opacity: 0.55 } : null]}
          onPress={handleLeave}
          activeOpacity={0.72}
          disabled={leaveBusy}
        >
          <LogOut size={19} color={ui.danger} strokeWidth={2} />
          <Text style={[styles.leaveText, { color: ui.danger }]}>{t('chat:settings.leave.action')}</Text>
        </TouchableOpacity>

      </ScrollView>

      <SoundModal visible={soundVisible} onClose={() => setSoundVisible(false)} selectedSound={selectedSound} onSelect={handleSoundChange} ui={ui} bottomInset={insets.bottom} />
      <ThemeModal visible={themeVisible} onClose={() => setThemeVisible(false)} currentTheme={settingThemeOverride} roomType={info.roomType} onSelect={handleThemeChange} ui={ui} bottomInset={insets.bottom} />
      <TranslationSettingsPanel
        visible={translateVisible}
        onClose={() => setTranslateVisible(false)}
        roomType={panelRoomType}
        theme={CHAT_THEMES[panelRoomType]}
        autoTranslate={autoTranslate}
        onToggleAutoTranslate={handleToggleAutoTranslate}
        showTranslatedOnly={showTranslatedOnly}
        onToggleShowTranslatedOnly={handleToggleShowTranslatedOnly}
        userTier={userTier}
        translationTier={translationTier}
        setTranslationTier={handleChangeTranslationTier}
        translationTone={translationTone}
        setTranslationTone={handleChangeTranslationTone}
        viewLang={viewLang}
        settingLang={settingLang}
        onChangeViewLang={handleChangeViewLang}
        preferredLang={preferredLang}
        onChangePreferredLang={handleChangePreferredLang}
        peerViewLang={peerViewLang}
        peerSettingLang={peerSettingLang}
        onPressUpgrade={() => {}}
        onRefreshUserTier={fetchData}
      />

      <Modal
        visible={secureBackupCodeVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSecureBackupCodeModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.backupModalCard, { backgroundColor: ui.surface, borderColor: ui.border, borderWidth: ui.hairline, borderRadius: ui.radius.rowGroup }]}> 
            <Text style={[styles.backupModalTitle, { color: ui.textPrimary }]}>{t('chat:settings.secure.recoveryCodeTitle')}</Text>
            <Text style={[styles.backupModalMessage, { color: ui.textSecondary }]}>{t('chat:settings.secure.recoveryCodeMessage')}</Text>
            <View style={styles.recoveryCodeBoxWrap}>
              <Text
                selectable
                style={[
                  styles.recoveryCodeBox,
                  {
                    color: ui.textPrimary,
                    backgroundColor: ui.surfaceRaised,
                    borderColor: ui.border,
                    borderWidth: ui.hairline,
                  },
                ]}
              >
                {secureBackupRecoveryCode}
              </Text>
              <TouchableOpacity
                style={[
                  styles.recoveryCodeCopyButton,
                  {
                    backgroundColor: ui.surface,
                    borderColor: ui.border,
                    borderWidth: ui.hairline,
                  },
                ]}
                onPress={handleCopySecureBackupRecoveryCode}
                activeOpacity={0.72}
                accessibilityRole="button"
                accessibilityLabel={t('chat:settings.secure.copyRecoveryCode')}
              >
                {secureBackupCodeCopied ? <Check size={15} color={ui.textPrimary} strokeWidth={2.5} /> : <Copy size={15} color={ui.textPrimary} strokeWidth={2.1} />}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.backupChecklistRow}
              onPress={() => {
                setSecureBackupCodeStored((prev) => !prev);
                setSecureBackupCodeNotice(null);
              }}
              activeOpacity={0.72}
            >
              <View style={[styles.backupCheckBox, { borderColor: secureBackupCodeStored ? ui.textPrimary : ui.border, backgroundColor: secureBackupCodeStored ? ui.textPrimary : 'transparent', borderWidth: ui.hairline }]}> 
                {secureBackupCodeStored ? <Check size={13} color={ui.background} strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.backupChecklistText, { color: ui.textSecondary }]}>{t('chat:settings.secure.codeStored')}</Text>
            </TouchableOpacity>
            {secureBackupCodeNotice ? <Text style={[styles.backupCodeNotice, { color: secureBackupCodeCopied ? ui.textSecondary : ui.danger }]}>{secureBackupCodeNotice}</Text> : null}
            <TouchableOpacity
              style={[styles.backupPrimaryButton, { backgroundColor: secureBackupCodeStored || secureBackupCodeCopied ? ui.textPrimary : ui.surfaceRaised, borderRadius: ui.radius.button }]}
              onPress={handleCloseSecureBackupCodeModal}
              activeOpacity={0.82}
            >
              <Text style={[styles.backupPrimaryButtonText, { color: secureBackupCodeStored || secureBackupCodeCopied ? ui.background : ui.textDisabled }]}>{t('common:ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={secureBackupRestoreVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!secureBackupLoading) { setSecureBackupRestoreVisible(false); setSecureBackupRestoreCode(''); setSecureBackupRestoreError(null); } }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.backupModalCard, { backgroundColor: ui.surface, borderColor: ui.border, borderWidth: ui.hairline, borderRadius: ui.radius.rowGroup }]}> 
            <Text style={[styles.backupModalTitle, { color: ui.textPrimary }]}>{t('chat:settings.secure.restore')}</Text>
            <Text style={[styles.backupModalMessage, { color: ui.textSecondary }]}>{t('chat:settings.secure.restoreMessage')}</Text>
            <TextInput
              value={secureBackupRestoreCode}
              onChangeText={(text) => { setSecureBackupRestoreCode(text); if (secureBackupRestoreError) setSecureBackupRestoreError(null); }}
              placeholder="COONN-..."
              placeholderTextColor={ui.textDisabled}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.backupInput, { color: ui.textPrimary, backgroundColor: ui.surfaceRaised, borderColor: secureBackupRestoreError ? ui.danger : ui.border, borderWidth: ui.hairline }]}
            />
            {secureBackupRestoreError ? <Text style={[styles.backupError, { color: ui.danger }]}>{secureBackupRestoreError}</Text> : null}
            <View style={styles.backupButtonRow}>
              <TouchableOpacity style={[styles.backupSecondaryButton, { borderColor: ui.border, borderWidth: ui.hairline, borderRadius: ui.radius.button }]} onPress={() => { setSecureBackupRestoreVisible(false); setSecureBackupRestoreCode(''); setSecureBackupRestoreError(null); }} activeOpacity={0.72} disabled={secureBackupLoading}>
                <Text style={[styles.backupSecondaryButtonText, { color: ui.textSecondary }]}>{t('common:cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.backupPrimaryButton, styles.backupButtonFlex, { backgroundColor: ui.textPrimary, borderRadius: ui.radius.button }]} onPress={handleRestoreSecureBackup} activeOpacity={0.82} disabled={secureBackupLoading}>
                {secureBackupLoading ? <ActivityIndicator size="small" color={ui.background} /> : <Text style={[styles.backupPrimaryButtonText, { color: ui.background }]}>{t('chat:settings.secure.restoreAction')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CoonnAlert
        visible={exportAlertVisible}
        theme={ui.alertTheme}
        title={t('chat:settings.export.title')}
        message={t('chat:settings.export.message')}
        confirmText={t('chat:settings.export.saveFile')}
        secondaryConfirmText={t('chat:settings.export.share')}
        secondaryVariant="default"
        cancelText={t('common:cancel')}
        onConfirm={async () => {
          setExportAlertVisible(false);
          await runExport('save');
        }}
        onSecondaryConfirm={async () => {
          setExportAlertVisible(false);
          await runExport('share');
        }}
        onCancel={() => setExportAlertVisible(false)}
        dismissOnBackdrop={false}
      />

      <CoonnAlert
        visible={secureNewKeyConfirmVisible}
        theme={ui.alertTheme}
        title={t('chat:settings.secure.newKeyConfirmTitle')}
        message={t('chat:settings.secure.newKeyConfirmMessage')}
        confirmText={t('chat:settings.secure.create')}
        cancelText={t('common:cancel')}
        onConfirm={handleCreateNewSecureRoomKey}
        onCancel={() => setSecureNewKeyConfirmVisible(false)}
        dismissOnBackdrop={!secureRecoveryLoading}
      />

      <CoonnAlert
        visible={secureHistoryRequestConfirmVisible}
        theme={ui.alertTheme}
        title={t('chat:settings.secure.historyRequestConfirmTitle')}
        message={t('chat:settings.secure.historyRequestConfirmMessage')}
        confirmText={t('chat:settings.secure.request')}
        cancelText={t('common:cancel')}
        onConfirm={handleRequestHistorySecureKeys}
        onCancel={() => setSecureHistoryRequestConfirmVisible(false)}
        dismissOnBackdrop={!secureRecoveryLoading}
      />

      <CoonnAlert
        visible={Boolean(secureHistoryApproveTarget)}
        theme={ui.alertTheme}
        title={t('chat:settings.secure.historyShareConfirmTitle')}
        message={t('chat:settings.secure.historyShareConfirmMessage', { name: getSecureRecoveryMemberName(secureHistoryApproveTarget?.requesterUserId) })}
        confirmText={t('common:share')}
        cancelText={t('common:cancel')}
        onConfirm={handleApproveHistorySecureKeys}
        onCancel={() => setSecureHistoryApproveTarget(null)}
        dismissOnBackdrop={!secureRecoveryLoading}
      />

      <CoonnAlert
        visible={Boolean(secureHistoryRejectTarget)}
        theme={ui.alertTheme}
        variant="danger"
        title={t('chat:settings.secure.historyRejectConfirmTitle')}
        message={t('chat:settings.secure.historyRejectConfirmMessage', { name: getSecureRecoveryMemberName(secureHistoryRejectTarget?.requesterUserId) })}
        confirmText={t('chat:settings.secure.decline')}
        cancelText={t('common:cancel')}
        onConfirm={handleRejectHistorySecureKeys}
        onCancel={() => setSecureHistoryRejectTarget(null)}
        dismissOnBackdrop={!secureRecoveryLoading}
      />

      <CoonnAlert
        visible={secureBackupConfirmVisible}
        theme={ui.alertTheme}
        title={secureBackupConfirmTitle}
        message={secureBackupConfirmMessage}
        confirmText={secureBackupConfirmText}
        cancelText={t('common:cancel')}
        onConfirm={handleCreateOrUpdateSecureBackup}
        onCancel={() => setSecureBackupConfirmVisible(false)}
        dismissOnBackdrop={!secureBackupLoading}
      />

      <CoonnAlert
        visible={secureBackupResultVisible}
        theme={ui.alertTheme}
        title={secureBackupResultTitle}
        message={secureBackupResultMessage}
        confirmText={t('common:ok')}
        onConfirm={() => setSecureBackupResultVisible(false)}
        onCancel={() => setSecureBackupResultVisible(false)}
      />

      <CoonnAlert
        visible={secureBackupDeleteVisible}
        theme={ui.alertTheme}
        variant="danger"
        title={t('chat:settings.secure.backupDeleteConfirmTitle')}
        message={t('chat:settings.secure.backupDeleteConfirmMessage')}
        confirmText={t('common:delete')}
        cancelText={t('common:cancel')}
        onConfirm={handleDeleteSecureBackup}
        onCancel={() => setSecureBackupDeleteVisible(false)}
        dismissOnBackdrop={!secureBackupLoading}
      />

      <CoonnFloatingToast
        visible={floatingToast.visible}
        message={floatingToast.message}
        tone={floatingToast.tone}
        showMark={floatingToast.showMark}
        theme={floatingToastTheme}
        bottomOffset={Math.max(insets.bottom, 0) + 28}
        onHidden={hideFloatingToast}
      />

      <CoonnAlert
        visible={leaveAlertVisible}
        theme={ui.alertTheme}
        variant="danger"
        title={t('chat:settings.leave.title')}
        message={leaveMessage}
        confirmText={t('chat:settings.leave.action')}
        secondaryConfirmText={leaveSecondaryText}
        cancelText={t('common:cancel')}
        onConfirm={performLeave}
        onSecondaryConfirm={leaveSecondaryText ? performLeave : undefined}
        onCancel={() => setLeaveAlertVisible(false)}
        dismissOnBackdrop={false}
      />

      <RoomAccessGuardOverlay
        roomId={roomId}
        me={info?.myId ?? null}
        navigation={navigation}
        topInset={Math.max(insets.top, 0)}
        bottomInset={Math.max(insets.bottom, 0)}
      />
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    marginLeft: -6,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  profileSection: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 12,
    overflow: 'hidden',
  },
  profileMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarWrap: {
    marginRight: 14,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    height: 70,
    justifyContent: 'center',
    paddingRight: 10,
  },
  profileEditColumn: {
    width: 58,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  avatar: {
    width: 70,
    height: 70,
  },
  hiddenAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenAvatarMark: {
    width: 30,
    height: 30,
  },
  stackWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  stackImg: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 15,
    backgroundColor: '#E5E7EB',
    borderWidth: 2,
  },
  stackA: {
    left: 2,
    top: 2,
    zIndex: 1,
  },
  stackB: {
    right: 2,
    top: 2,
    zIndex: 1,
  },
  stackC: {
    left: 16,
    bottom: 2,
    zIndex: 2,
  },
  roomName: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    marginBottom: 5,
  },
  memberCount: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 4,
  },
  startedDate: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  editBtn: {
    minWidth: 50,
    paddingHorizontal: 13,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  section: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginBottom: 6,
  },
  sectionHeaderRow: {
    minHeight: 16,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeaderNoMargin: {
    marginBottom: 0,
  },
  labelWithAttentionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    maxWidth: '100%',
    minWidth: 0,
    gap: 6,
    marginBottom: 1,
  },
  secureAttentionTitle: {
    flexShrink: 1,
    minWidth: 0,
  },
  secureAttentionWrap: {
    position: 'relative',
    borderRadius: 18,
    marginVertical: 0,
  },
  secureAttentionRow: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  secureAttentionCheckSlot: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  secureAttentionPillIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  secureAttentionIconRipple: {
    position: 'absolute',
    left: -3,
    right: -3,
    top: -3,
    bottom: -3,
    borderRadius: 999,
    borderWidth: 1,
  },
  secureAttentionPillIcon: {
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  rowIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 1,
    maxWidth: '58%',
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  rowSubLabel: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  rowValue: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '400',
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 0,
    marginVertical: 4,
  },
  secureRequestList: {
    paddingVertical: 0,
    gap: 0,
  },
  secureRequestRow: {
    minHeight: 54,
    paddingVertical: 0,
    paddingHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  secureRequestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  secureRequestPill: {
    minHeight: 32,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secureRequestPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  backupModalCard: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
  },
  backupModalTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  backupModalMessage: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    marginBottom: 14,
  },
  recoveryCodeBoxWrap: {
    position: 'relative',
    marginBottom: 16,
  },
  recoveryCodeBox: {
    width: '100%',
    minHeight: 74,
    paddingLeft: 12,
    paddingRight: 48,
    paddingTop: 12,
    paddingBottom: 16,
    borderRadius: 14,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  recoveryCodeCopyButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupInput: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  backupCodeNotice: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: -8,
    marginBottom: 12,
  },
  backupError: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    marginBottom: 10,
  },
  backupButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  backupButtonFlex: {
    flex: 1,
  },
  backupPrimaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  backupPrimaryButtonText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  backupSecondaryButton: {
    minHeight: 44,
    minWidth: 86,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  backupSecondaryButtonText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  backupChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: -4,
    marginBottom: 16,
  },
  backupCheckBox: {
    width: 19,
    height: 19,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupChecklistText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  colorPreview: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  themePreviewCard: {
    padding: 10,
    marginTop: 2,
    marginBottom: 10,
  },
  themePreviewTop: {
    height: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  themePreviewAvatar: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  themePreviewTitle: {
    width: 58,
    height: 8,
    borderRadius: 999,
  },
  themePreviewWindow: {
    minHeight: 112,
    paddingHorizontal: 12,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  previewBubble: {
    maxWidth: '70%',
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginBottom: 8,
  },
  previewOtherBubble: {
    alignSelf: 'flex-start',
  },
  previewMyBubble: {
    alignSelf: 'flex-end',
    marginBottom: 10,
  },
  previewBubbleText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  themePreviewInput: {
    marginTop: 'auto',
    height: 18,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  themePreviewInputLine: {
    width: 52,
    height: 5,
    borderRadius: 999,
  },
  leaveButton: {
    marginTop: 12,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  leaveText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  bottomSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheetContent: {
    paddingBottom: 34,
    maxHeight: '72%',
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 999,
  },
  sheetHeader: {
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  sheetScroll: {
    maxHeight: 400,
  },
  themeSheetScroll: {
    maxHeight: 450,
  },
  sheetRow: {
    minHeight: 58,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 22,
  },
  sheetRowText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  activeText: {
    fontWeight: '600',
  },
  sheetCloseBtn: {
    marginTop: 10,
    alignSelf: 'center',
    padding: 12,
  },
  sheetCloseText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  colorPreviewCircle: {
    width: 24,
    height: 24,
  },
  themeOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  themeOptionTextBox: {
    flex: 1,
    minWidth: 0,
  },
  themeOptionSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
});
function chatStaticText(key: string, fallback: string, options?: Record<string, unknown>): string {
  return String(i18next.t(key, { defaultValue: fallback, ...(options ?? {}) }));
}


