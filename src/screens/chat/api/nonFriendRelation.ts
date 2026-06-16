// src/screens/chat/api/nonFriendRelation.ts
import { supabase } from '@/lib/supabase';

function parseUuid(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export async function addFriendMetaDirect(ownerUserId: string, friendUserId: string) {
  const ownerId = parseUuid(ownerUserId);
  const targetId = parseUuid(friendUserId);

  if (!ownerId || !targetId) throw new Error('invalid_friend_user_id');
  if (ownerId === targetId) throw new Error('cannot_add_self');

  // 친구 삭제 후 남아 있을 수 있는 비활성 row는 먼저 제거한다.
  // 이미 친구인 active row는 건드리지 않아 alias/memo/favorite 회귀를 막는다.
  const { error: cleanupError } = await supabase
    .from('friend_meta')
    .delete()
    .eq('owner_user_id', ownerId)
    .eq('friend_user_id', targetId)
    .eq('is_friend', false);

  if (cleanupError) throw cleanupError;

  const { error } = await supabase.from('friend_meta').upsert(
    {
      owner_user_id: ownerId,
      friend_user_id: targetId,
      is_friend: true,
      is_hidden: false,
    },
    { onConflict: 'owner_user_id,friend_user_id' },
  );

  if (error) throw error;
}
