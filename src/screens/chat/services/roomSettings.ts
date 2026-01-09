// src/screens/chat/services/roomSettings.ts
import { supabase } from '@/lib/supabase';
import type { Tier } from '@/lib/chatSync/push';

export type RoomSettingsRow = {
  room_id: number;
  user_id: string;
  auto_translate: boolean;
  show_translated_only: boolean;
  translation_tier: Tier | null;
  translation_tone: string | null;
  view_lang: string | null;
  preferred_lang: string | null;
  updated_at?: string;
};

export async function fetchRoomSettings(roomId: number, userId: string): Promise<RoomSettingsRow | null> {
  const { data, error } = await supabase
    .from('chat_room_settings')
    .select(
      'room_id,user_id,auto_translate,show_translated_only,translation_tier,translation_tone,view_lang,preferred_lang,updated_at',
    )
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[chat_room_settings] fetch error', (error as any)?.message ?? error);
    return null;
  }

  return (data ?? null) as any;
}

export async function upsertRoomSettings(roomId: number, userId: string, patch: Partial<RoomSettingsRow>) {
  const payload: any = {
    room_id: roomId,
    user_id: userId,
    updated_at: new Date().toISOString(),
    ...patch,
  };

  const { error } = await supabase.from('chat_room_settings').upsert(payload, { onConflict: 'room_id,user_id' });
  if (error) {
    console.warn('[chat_room_settings] upsert error', (error as any)?.message ?? error, payload);
  }
}
