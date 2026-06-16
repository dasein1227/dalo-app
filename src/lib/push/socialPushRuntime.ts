import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import {
  navigateByDeepLink,
  navigateToFriendRequestsFromPush,
  navigateToPostDetailFromPush,
} from '@/navigation/navigationRef';

export const SOCIAL_NOTIFICATION_CATEGORY_ID = 'COONN_SOCIAL_NOTIFICATION';
export const SOCIAL_CHANNEL_ID = 'social';

const RESPONSE_CACHE_KEY = '@coonn/push/handled-social-response-v1';

type SocialPushData = {
  eventType: string;
  outboxId: string;
  entityType: string;
  entityId: string;
  deeplink: string;
  socialType: string;
  friendshipId: string;
  postId: string;
  actorUserId: string;
  actorNickname: string;
  actorAvatarUrl: string | null;
  previewMode: string;
  previewText: string;
  notificationTitle: string;
  notificationSubtitle: string;
  notificationBody: string;
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

function isSupportedSocialEventType(eventType: string): boolean {
  switch (eventType) {
    case 'friend.request.created':
    case 'post.comment.created':
    case 'post.reply.created':
    case 'post.mention.created':
    case 'post.like.created':
      return true;
    default:
      return false;
  }
}

function parseSocialPushData(input: unknown): SocialPushData | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  const data = input as Record<string, unknown>;
  const eventType = normalizeString(data.event_type);
  const socialType = normalizeString(data.social_type);
  const notificationKind = normalizeString(data.notification_kind);

  const looksSocial =
    isSupportedSocialEventType(eventType) ||
    notificationKind === 'social' ||
    socialType === 'friend_request' ||
    socialType.startsWith('post_');

  if (!looksSocial) return null;

  return {
    eventType,
    outboxId: normalizeString(data.outbox_id),
    entityType: normalizeString(data.entity_type),
    entityId: normalizeString(data.entity_id),
    deeplink: normalizeString(data.deeplink),
    socialType,
    friendshipId: normalizeString(data.friendship_id),
    postId: normalizeString(data.post_id),
    actorUserId: normalizeString(data.actor_user_id),
    actorNickname: normalizeString(data.actor_nickname),
    actorAvatarUrl: normalizeString(data.actor_avatar_url) || null,
    previewMode: normalizeString(data.preview_mode),
    previewText: normalizeString(data.preview_text) || normalizeString(data.request_message),
    notificationTitle: normalizeString(data.notification_title),
    notificationSubtitle: normalizeString(data.notification_subtitle),
    notificationBody: normalizeString(data.notification_body),
  };
}

function navigateFromSocialPayload(payload: SocialPushData): boolean {
  if (payload.deeplink && navigateByDeepLink(payload.deeplink)) {
    return true;
  }

  switch (payload.eventType) {
    case 'friend.request.created':
      navigateToFriendRequestsFromPush();
      return true;

    case 'post.comment.created':
    case 'post.reply.created':
    case 'post.mention.created':
    case 'post.like.created':
      if (payload.postId) {
        navigateToPostDetailFromPush(payload.postId);
        return true;
      }
      return false;

    default:
      return false;
  }
}

export async function ensureSocialNotificationCategory(): Promise<void> {
  // Social notifications are tap-only. Expo rejects categories without actions.
}

export async function ensureSocialNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(SOCIAL_CHANNEL_ID, {
    name: '소셜',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 180, 80, 180],
    lightColor: '#FFFFFF',
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<boolean> {
  const payload = parseSocialPushData(response.notification.request.content.data);
  if (!payload) return false;

  const cacheKey = buildResponseCacheKey(response);
  if (await wasResponseHandled(cacheKey)) {
    return true;
  }

  await markResponseHandled(cacheKey);
  return navigateFromSocialPayload(payload);
}