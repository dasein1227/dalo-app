import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { supabase } from '@/lib/supabase';
import { markReadOnServer, sendRoomMessage, type RoomType } from '@/lib/chatSync/push';
import { navigateToChatFromPush } from '@/navigation/navigationRef';

export const CHAT_PUSH_TASK_NAME = 'coonn-chat-push-task';
export const CHAT_NOTIFICATION_CATEGORY_ID = 'COONN_CHAT_MESSAGE';
export const CHAT_ACTION_READ_ID = 'coonn-chat-read';
export const CHAT_ACTION_REPLY_ID = 'coonn-chat-reply';
export const CHAT_CHANNEL_ID = 'chat';

const RESPONSE_CACHE_KEY = '@coonn/push/handled-response-v1';

type ChatPushData = {
  eventType: string;
  outboxId: string;
  entityType: string;
  entityId: string;
  roomId: number;
  roomSeq: number | null;
  roomType: string;
  roomTitle: string;
  roomAvatarUrl: string | null;
  senderId: string;
  senderNickname: string;
  senderAvatarUrl: string | null;
  messageUid: string;
  messageKind: string;
  previewMode: string;
  previewText: string;
  deeplink: string;
  dedupeKey: string;
  localRendered: boolean;
  notificationTitle: string;
  notificationSubtitle: string;
  notificationBody: string;
};

type ChatPushRoute = {
  roomId: number;
  title?: string;
  roomType?: string;
  beaconId?: string;
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asPositiveIntOrNull(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function parseChatPushData(input: unknown): ChatPushData | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const data = input as Record<string, unknown>;
  const roomId =
    asPositiveIntOrNull(data.room_id) ??
    asPositiveIntOrNull(data.roomId) ??
    asPositiveIntOrNull((data as any).rid);

  if (!roomId) return null;

  return {
    eventType: normalizeString(data.event_type),
    outboxId: normalizeString(data.outbox_id),
    entityType: normalizeString(data.entity_type),
    entityId: normalizeString(data.entity_id),
    roomId,
    roomSeq: asPositiveIntOrNull(data.room_seq),
    roomType: normalizeString(data.room_type),
    roomTitle:
      normalizeString(data.room_title) ||
      normalizeString(data.title) ||
      '채팅',
    roomAvatarUrl: normalizeString(data.room_avatar_url) || null,
    senderId: normalizeString(data.sender_id),
    senderNickname: normalizeString(data.sender_nickname) || '상대방',
    senderAvatarUrl: normalizeString(data.sender_avatar_url) || null,
    messageUid: normalizeString(data.message_uid),
    messageKind: normalizeString(data.message_kind) || 'text',
    previewMode: normalizeString(data.preview_mode) || 'safe_preview',
    previewText: normalizeString(data.display_body_for_push) || normalizeString(data.preview_text),
    deeplink: normalizeString(data.deeplink),
    dedupeKey: normalizeString(data.dedupe_key),
    localRendered: normalizeString(data.local_rendered) === '1',
    notificationTitle: normalizeString(data.notification_title),
    notificationSubtitle: normalizeString(data.notification_subtitle),
    notificationBody: normalizeString(data.notification_body),
  };
}

function buildResponseCacheKey(response: Notifications.NotificationResponse): string {
  const requestId = normalizeString(response.notification.request.identifier);
  const actionId = normalizeString(response.actionIdentifier);
  return `${requestId}:${actionId}`;
}

async function wasResponseHandled(cacheKey: string): Promise<boolean> {
  if (!cacheKey) return false;
  try {
    const raw = await AsyncStorage.getItem(RESPONSE_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const ts = Number(parsed?.[cacheKey] ?? 0);
    return Number.isFinite(ts) && Date.now() - ts <= 5 * 60 * 1000;
  } catch {
    return false;
  }
}

async function markResponseHandled(cacheKey: string): Promise<void> {
  if (!cacheKey) return;
  try {
    const raw = await AsyncStorage.getItem(RESPONSE_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    parsed[cacheKey] = Date.now();
    await AsyncStorage.setItem(RESPONSE_CACHE_KEY, JSON.stringify(parsed));
  } catch {}
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return normalizeString(data.session?.user?.id) || null;
  } catch {
    return null;
  }
}

function buildBeaconId(payload: ChatPushData): string | undefined {
  const direct = normalizeString(payload.entityId);
  if (!direct) return undefined;
  return payload.roomType === 'beacon' ? direct : undefined;
}

function normalizeSendRoomType(roomType: string): RoomType {
  const v = String(roomType ?? '').trim().toLowerCase();
  return v === 'dm' || v === 'direct' || v === 'personal' || v === 'private' || v === 'self'
    ? 'direct'
    : 'group';
}

function toChatRoute(payload: ChatPushData): ChatPushRoute {
  return {
    roomId: payload.roomId,
    title: payload.roomTitle,
    roomType: payload.roomType,
    beaconId: buildBeaconId(payload),
  };
}

function parseChatRouteFromUrl(url: string | null | undefined): ChatPushRoute | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.host?.toLowerCase() ?? '';
    const path = parsed.pathname?.toLowerCase() ?? '';
    const isChatLink =
      host === 'push' ||
      host === 'chat' ||
      path === '/push/chat' ||
      path === '/chat';

    if (!isChatLink) return null;

    const roomId = asPositiveIntOrNull(parsed.searchParams.get('roomId'));
    if (!roomId) return null;

    return {
      roomId,
      title: normalizeString(parsed.searchParams.get('title')) || undefined,
      roomType: normalizeString(parsed.searchParams.get('roomType')) || undefined,
    };
  } catch {
    return null;
  }
}

async function handleReadAction(payload: ChatPushData): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId || !payload.roomSeq || payload.roomSeq <= 0) return;

  await markReadOnServer({
    roomId: payload.roomId,
    userId,
    seq: payload.roomSeq,
    reason: 'push_action_read',
  });
}

async function handleReplyAction(
  payload: ChatPushData,
  response: Notifications.NotificationResponse,
): Promise<void> {
  const userText = normalizeString((response as any).userText);
  if (!userText) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  await sendRoomMessage({
    roomId: payload.roomId,
    senderId: userId,
    content: userText,
    original: userText,
    kind: 'text',
    roomType: normalizeSendRoomType(payload.roomType),
    replyToMessageId: payload.messageUid || null,
  });
}

export async function ensureChatNotificationCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(
    CHAT_NOTIFICATION_CATEGORY_ID,
    [
      {
        identifier: CHAT_ACTION_READ_ID,
        buttonTitle: '읽음',
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: CHAT_ACTION_REPLY_ID,
        buttonTitle: '답장',
        textInput: {
          submitButtonTitle: '보내기',
          placeholder: '답장을 입력하세요',
        },
        options: {
          opensAppToForeground: false,
        },
      },
    ],
    {
      allowAnnouncement: false,
      allowInCarPlay: false,
      customDismissAction: false,
      intentIdentifiers: [],
      previewPlaceholder: '새 메시지',
      showTitle: true,
      showSubtitle: true,
    },
  );
}

export async function ensureChatNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHAT_CHANNEL_ID, {
    name: '채팅',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 180, 80, 180],
    lightColor: '#FFFFFF',
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

export async function registerChatPushTaskAsync(): Promise<void> {
  // Android는 네이티브 FirebaseMessagingService가 백그라운드/종료 상태를 담당한다.
  // 이 함수는 기존 import 경로를 유지하기 위한 no-op에 가깝다.
}

export async function renderLocalChatNotificationFromRemoteData(): Promise<boolean> {
  // Android는 네이티브 서비스에서 렌더링한다. iOS/기타 fallback 용도로만 확장 가능.
  return false;
}

export async function navigateFromChatData(
  data: Record<string, unknown> | null | undefined,
): Promise<boolean> {
  const payload = parseChatPushData(data);
  if (!payload) return false;

  navigateToChatFromPush(toChatRoute(payload));
  return true;
}

export async function navigateFromChatUrl(
  url: string | null | undefined,
): Promise<boolean> {
  const route = parseChatRouteFromUrl(url);
  if (!route) return false;

  navigateToChatFromPush(route);
  return true;
}

export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<boolean> {
  const payload = parseChatPushData(response.notification.request.content.data);
  if (!payload) return false;

  const cacheKey = buildResponseCacheKey(response);
  if (await wasResponseHandled(cacheKey)) {
    return true;
  }

  await markResponseHandled(cacheKey);

  const actionId = normalizeString(response.actionIdentifier);

  if (actionId === CHAT_ACTION_READ_ID) {
    await handleReadAction(payload);
    return true;
  }

  if (actionId === CHAT_ACTION_REPLY_ID) {
    await handleReplyAction(payload, response);
    return true;
  }

  navigateToChatFromPush(toChatRoute(payload));
  return true;
}

const SCHEDULE_NOTIFICATION_KIND = 'chat_schedule';

function isScheduleNotification(notification: Notifications.Notification): boolean {
  const data = notification?.request?.content?.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return false;

  const kind = typeof data.kind === 'string' ? data.kind.trim() : '';
  const notificationKind =
    typeof data.notification_kind === 'string' ? data.notification_kind.trim() : '';

  return kind === SCHEDULE_NOTIFICATION_KIND || notificationKind === 'schedule';
}

export function installForegroundNotificationPolicy() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      if (isScheduleNotification(notification)) {
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
      }

      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    },
  });
}
