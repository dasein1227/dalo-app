// src/features/openProfiles/openProfiles.read.ts

import { supabase } from '@/lib/supabase';
import type { OpenProfile, OpenProfileUsedRoom } from './openProfiles.types';

const asText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
};

const asBool = (value: unknown): boolean => value === true;

const asNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

function normalizeUsedRoom(raw: any): OpenProfileUsedRoom {
  return {
    room_id: Number(raw?.room_id ?? 0),
    title: asText(raw?.title),
    cover_image_url: asText(raw?.cover_image_url),
    type: asText(raw?.type),
    subtype: asText(raw?.subtype),
    room_nickname: asText(raw?.room_nickname),
    room_avatar_url: asText(raw?.room_avatar_url),
    room_status_message: asText(raw?.room_status_message),
    joined_at: asText(raw?.joined_at),
  };
}

function normalizeOpenProfile(raw: any): OpenProfile {
  const roomsSource = Array.isArray(raw?.used_rooms) ? raw.used_rooms : [];

  return {
    id: String(raw?.id ?? ''),
    owner_user_id: String(raw?.owner_user_id ?? ''),
    nickname: asText(raw?.nickname) ?? '사용자',
    avatar_url: asText(raw?.avatar_url),
    status_message: asText(raw?.status_message),
    is_default: asBool(raw?.is_default),
    created_at: String(raw?.created_at ?? ''),
    updated_at: String(raw?.updated_at ?? ''),
    deleted_at: asText(raw?.deleted_at),
    used_room_count: asNumber(raw?.used_room_count ?? roomsSource.length),
    used_rooms: roomsSource.map(normalizeUsedRoom).filter((item) => item.room_id > 0),
  };
}

export async function listMyOpenProfiles(): Promise<OpenProfile[]> {
  const ensure = await supabase.rpc('ensure_default_open_profile_v1');
  if (ensure.error) throw ensure.error;

  const { data, error } = await supabase.rpc('list_my_open_profiles_v1');
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map(normalizeOpenProfile);
}
