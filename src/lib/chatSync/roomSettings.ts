// src/lib/chatSync/roomSettings.ts
import { supabase } from '@/lib/supabase';
import type { Tier } from '@/lib/chatSync/push';

export type RoomChatSettings = {
  room_id: number;
  user_id: string;

  auto_translate: boolean;
  show_translated_only: boolean;

  translation_tier: Tier | null;
  translation_tone: string | null;

  view_lang: string | null;       // 송신언어(내가 보는 기준)
  preferred_lang: string | null;  // 발신/수신 타깃(너 코드에서는 preferred를 self 타깃으로도 씀)

  updated_at?: string;
};

export async function fetchRoomSettings(roomId: number, userId: string) {
  const { data, error } = await supabase
    .from('chat_room_settings')
    .select('room_id,user_id,auto_translate,show_translated_only,translation_tier,translation_tone,view_lang,preferred_lang,updated_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as RoomChatSettings | null;
}

export async function upsertRoomSettings(roomId: number, userId: string, patch: Partial<RoomChatSettings>) {
  const payload: any = {
    room_id: roomId,
    user_id: userId,
    updated_at: new Date().toISOString(),
    ...patch,
  };

  const { error } = await supabase
    .from('chat_room_settings')
    .upsert(payload, { onConflict: 'room_id,user_id' });

  if (error) throw error;
}
