// src/screens/chat/schedule/types.ts

export type ChatScheduleStatus = 'active' | 'cancelled' | 'completed';
export type ChatScheduleParticipantStatus = 'joined' | 'left';

export type ChatScheduleRouteParams = {
  roomId: number | string;
  roomTitle?: string | null;
  title?: string | null;
  roomType?: string | null;
  chatThemeKey?: string | null;
  themeKey?: string | null;
};

export type ChatScheduleListRouteParams = ChatScheduleRouteParams;

export type ChatScheduleDetailRouteParams = ChatScheduleRouteParams & {
  scheduleId: string;
};

export type ChatScheduleEditorRouteParams = ChatScheduleRouteParams & {
  mode?: 'create' | 'edit';
  scheduleId?: string | null;
};

export type ChatSchedule = {
  id: string;
  room_id: number;
  creator_user_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  place_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  business_id: string | null;
  business_name?: string | null;
  business_avatar_url?: string | null;
  status: ChatScheduleStatus;
  participant_count?: number;
  my_participant_status?: ChatScheduleParticipantStatus | null;
  my_reminder_offset_minutes?: number | null;
  created_at: string;
  updated_at: string;
};

export type ChatScheduleParticipantRole = 'participant' | 'notice';

export type ChatScheduleParticipant = {
  schedule_id: string;
  user_id: string;
  status: ChatScheduleParticipantStatus;
  joined_at: string | null;
  updated_at: string | null;
  role: ChatScheduleParticipantRole;
  nickname: string | null;
  avatar_url: string | null;
  room_nickname: string | null;
  room_avatar_url: string | null;
};

export type ChatScheduleDraft = {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  place_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  business_id: string | null;
};

export type ReminderOption = {
  label: string;
  offsetMinutes: number | null;
};
