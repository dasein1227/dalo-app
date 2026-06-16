// src/lib/notifications/types.ts

export const IN_APP_NOTIFICATION_TYPES = [
  'follow.created',
  'chat.reply.created',
  'chat.mention.created',
  'beacon.join_request.created',
  'beacon.join_approved',
  'beacon.friend.created',
  'schedule.created',
  'schedule.updated',
  'schedule.cancelled',
  'post.like.grouped',
  'post.comment.grouped',
  'post.reply.grouped',
  'post.mention.grouped',
] as const;

export type InAppNotificationType = typeof IN_APP_NOTIFICATION_TYPES[number];

export type InAppNotificationTargetType =
  | 'profile'
  | 'post'
  | 'chat'
  | 'schedule'
  | 'beacon'
  | string;

export type InAppNotificationPayload = Record<string, unknown> | null;

export type InAppNotificationPreferences = Partial<Record<InAppNotificationType | string, boolean>>;

export type InAppNotificationSettings = {
  enabled: boolean;
  preferences: InAppNotificationPreferences;
};

export type InAppNotificationRow = {
  id: string;
  recipient_id: string;
  type: InAppNotificationType | string;
  group_key: string | null;

  actor_user_id: string | null;
  actor_nickname: string | null;
  actor_avatar_url: string | null;
  actor_count: number | null;

  target_type: InAppNotificationTargetType | null;
  target_id: string | null;
  post_id: string | null;
  room_id: number | null;
  schedule_id: string | null;
  beacon_id: number | null;
  message_uid: string | null;

  room_title: string | null;
  target_title: string | null;
  sample_text: string | null;
  thumbnail_url: string | null;
  deep_link: string | null;
  payload: InAppNotificationPayload;

  read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationSectionKey = 'today' | 'thisWeek' | 'older';

export type NotificationSection = {
  key: NotificationSectionKey;
  data: InAppNotificationRow[];
};

export type FollowStateMap = Record<string, boolean>;
