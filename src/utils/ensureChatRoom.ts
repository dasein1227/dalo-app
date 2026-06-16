// src/utils/ensureChatRoom.ts
import { supabase } from '@/lib/supabase';

type PreparedRoom = {
  id: number;
};

/**
 * 특정 비콘(beacon_id)에 대응하는 채팅방을 보장한다.
 * - 이미 있으면 그 room_id 를 돌려주고
 * - 없으면 새로 만들고
 * - chat_members 에도 나를 active 로 넣어준다.
 */
export async function ensureChatRoom(
  beaconId: string,
  userId: string,
): Promise<PreparedRoom | null> {
  const beaconIdNum = Number(beaconId);
  if (!Number.isFinite(beaconIdNum)) {
    throw new Error('잘못된 비콘 ID 입니다.');
  }

  // 1) 기존 방 있는지 확인 (type = 'beacon' + beacon_id)
  const { data: existingRooms, error: existingErr } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('type', 'beacon')
    .eq('beacon_id', beaconIdNum)
    .limit(1);

  if (existingErr) {
    throw existingErr;
  }

  let roomId: number;

  if (existingRooms && existingRooms.length > 0) {
    roomId = existingRooms[0].id as number;
  } else {
    // 2) 없으면 새로 생성
    const { data: inserted, error: insertErr } = await supabase
      .from('chat_rooms')
      .insert({
        type: 'beacon',
        custom_title: null,
        beacon_id: beaconIdNum,
        created_by: userId,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      throw insertErr ?? new Error('채팅방 생성 실패');
    }

    roomId = inserted.id as number;
  }

  // 3) chat_members 에 나를 넣어두기 (있으면 활성화)
  const { error: memberErr } = await supabase
    .from('chat_members')
    .upsert(
      {
        room_id: roomId,
        user_id: userId,
        joined_at: new Date().toISOString(),
        active: true,
        kicked: false,
        left_at: null,
      } as any,
      {
        onConflict: 'room_id,user_id',
      },
    );

  if (memberErr) {
    // 멤버십 실패해도 일단 room 자체는 리턴
  }

  return { id: roomId };
}
