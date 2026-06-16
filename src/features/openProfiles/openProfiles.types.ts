// src/features/openProfiles/openProfiles.types.ts

export type OpenProfileUsedRoom = {
  room_id: number;
  title: string | null;
  cover_image_url: string | null;
  type: string | null;
  subtype: string | null;
  room_nickname: string | null;
  room_avatar_url: string | null;
  room_status_message: string | null;
  joined_at: string | null;
};

export type OpenProfile = {
  id: string;
  owner_user_id: string;
  nickname: string;
  avatar_url: string | null;
  status_message: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  used_room_count: number;
  used_rooms: OpenProfileUsedRoom[];
};

export type OpenProfileDraft = {
  nickname: string;
  avatar_url?: string | null;
  status_message?: string | null;
  is_default?: boolean;
};
