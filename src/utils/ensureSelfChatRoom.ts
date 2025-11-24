// src/utils/ensureSelfChatRoom.ts
import { supabase } from '@/lib/supabase';

export async function ensureSelfChatRoom(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  const uid = user.id;

  // 1) 이미 있는 self 방 찾아보기
  const { data: existing, error: exErr } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('type', 'self')
    .eq('created_by', uid)
    .is('beacon_id', null)
    .maybeSingle();

  if (exErr) throw exErr;
  if (existing?.id) return existing.id;

  // 2) 없으면 새로 만든다
  const { data: room, error: insErr } = await supabase
    .from('chat_rooms')
    .insert({
      type: 'self',
      created_by: uid,
      beacon_id: null,
      custom_title: null,
    })
    .select('id')
    .single();

  if (insErr) throw insErr;
  if (!room?.id) throw new Error('self chat room create failed');

  // 3) chat_members 에 나 자신 추가
  const { error: memErr } = await supabase
    .from('chat_members')
    .insert({ room_id: room.id, user_id: uid });

  if (memErr) throw memErr;

  return room.id as number;
}
