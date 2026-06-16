// src/lib/notifications/notificationRoutes.ts

import type { InAppNotificationRow } from './types';

const asNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
};

const asText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};

const payloadValue = (item: InAppNotificationRow, key: string): unknown => {
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  return (payload as Record<string, unknown>)[key];
};

export function openNotificationTarget(navigation: any, item: InAppNotificationRow) {
  const type = String(item.type ?? '');
  const targetType = String(item.target_type ?? '').toLowerCase();

  if (type === 'follow.created' || targetType === 'profile') {
    const userId = asText(item.actor_user_id ?? item.target_id ?? payloadValue(item, 'user_id'));
    if (userId) navigation.navigate('ProfileView', { user_id: userId });
    return;
  }

  if (targetType === 'post' || type.startsWith('post.')) {
    const postId = asText(item.post_id ?? item.target_id ?? payloadValue(item, 'post_id'));
    if (postId) navigation.navigate('PostDetail', { postId });
    return;
  }

  if (targetType === 'schedule' || type.startsWith('schedule.')) {
    const scheduleId = asText(item.schedule_id ?? item.target_id ?? payloadValue(item, 'schedule_id'));
    const roomId = asNumber(item.room_id ?? payloadValue(item, 'room_id'));
    if (scheduleId) {
      navigation.navigate('ChatScheduleDetail', {
        scheduleId,
        roomId: roomId ?? undefined,
        roomTitle: item.room_title ?? undefined,
        title: item.room_title ?? undefined,
      });
    }
    return;
  }

  if (targetType === 'beacon' || type.startsWith('beacon.')) {
    const beaconId = asNumber(item.beacon_id ?? item.target_id ?? payloadValue(item, 'beacon_id'));
    if (type === 'beacon.join_request.created' && beaconId) {
      navigation.navigate('MembersBeacon', { beaconId, id: beaconId });
      return;
    }
    if (beaconId) navigation.navigate('BeaconDetail', { beaconId, id: beaconId });
    return;
  }

  if (targetType === 'chat' || type.startsWith('chat.')) {
    const roomId = asNumber(item.room_id ?? item.target_id ?? payloadValue(item, 'room_id'));
    const messageUid = asText(item.message_uid ?? payloadValue(item, 'message_uid'));
    if (roomId) {
      navigation.navigate('Chat', {
        roomId,
        room_id: roomId,
        focusMessageUid: messageUid ?? undefined,
        messageUid: messageUid ?? undefined,
        anchorMessageUid: messageUid ?? undefined,
      });
    }
  }
}
