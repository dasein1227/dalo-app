import { supabase } from '../../../lib/supabase';
import { forceRefreshGroups } from '../../../lib/friends/groupSync';

async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw error;
  return data as T;
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error('not_authenticated');

  return userId;
}

function normalizeUserId(value: string) {
  return String(value ?? '').trim();
}

/**
 * CO·ONN friend relationship is one-way.
 *
 * Add friend means:
 * - owner_user_id = current user
 * - friend_user_id = target user
 * - is_friend = true
 *
 * There is no request / accept / pending state.
 */
export async function addFriend(targetId: string) {
  const ownerUserId = await getCurrentUserId();
  const friendUserId = normalizeUserId(targetId);

  if (!friendUserId) throw new Error('friend_user_id_required');
  if (ownerUserId === friendUserId) throw new Error('cannot_add_self');

  // If a stale soft-deleted row exists, remove it first so re-add starts clean.
  // Active friend rows are kept intact, so double taps do not wipe alias/memo/favorite.
  const { error: cleanupError } = await supabase
    .from('friend_meta')
    .delete()
    .eq('owner_user_id', ownerUserId)
    .eq('friend_user_id', friendUserId)
    .eq('is_friend', false);

  if (cleanupError) throw cleanupError;

  const { data, error } = await supabase
    .from('friend_meta')
    .upsert(
      {
        owner_user_id: ownerUserId,
        friend_user_id: friendUserId,
        is_friend: true,
        is_hidden: false,
      },
      { onConflict: 'owner_user_id,friend_user_id' },
    )
    .select('owner_user_id, friend_user_id, is_friend, is_hidden')
    .maybeSingle();

  if (error) throw error;

  await forceRefreshGroups();
  return data;
}

/**
 * Compatibility wrapper for stale callers.
 * This no longer sends a friend request. It performs owner-local addFriend().
 */
export async function sendFriendRequest(targetId: string, _message?: string | null) {
  return addFriend(targetId);
}

/**
 * Deprecated request-flow helpers.
 * Kept for compatibility with any stale callers until screens are fully cleaned up.
 */
export async function acceptFriendRequest(friendshipId: string) {
  return rpc('accept_friend_request', { friendship_id: friendshipId });
}

export async function rejectFriendRequest(friendshipId: string) {
  return rpc('reject_friend_request', { friendship_id: friendshipId });
}

export async function cancelFriendRequest(friendshipId: string) {
  return rpc('cancel_friend_request', { friendship_id: friendshipId });
}

export async function setFriendFavorite(friendId: string, favorite: boolean) {
  return rpc('set_friend_favorite', {
    friend_id: friendId,
    favorite,
  });
}

export async function setFriendAlias(friendId: string, alias: string | null) {
  return rpc('set_friend_alias', {
    friend_id: friendId,
    alias: alias?.trim() || null,
  });
}

export async function setFriendMemo(friendId: string, memo: string | null) {
  return rpc('set_friend_memo', {
    friend_id: friendId,
    memo: memo?.trim() || null,
  });
}

export async function setFriendHidden(friendId: string, hidden: boolean) {
  return rpc('set_friend_hidden', {
    friend_id: friendId,
    hidden,
  });
}

export async function setFriendBlock(friendId: string, blocked: boolean) {
  return rpc('set_friend_block', {
    target_id: friendId,
    blocked,
    reason: null,
  });
}

/**
 * Friend delete must remove the friend_meta row, not only set is_friend=false.
 * This guarantees alias/memo/favorite/hidden history is not restored after re-add.
 */
export async function removeFriend(friendId: string) {
  const ownerUserId = await getCurrentUserId();
  const friendUserId = normalizeUserId(friendId);

  if (!friendUserId) throw new Error('friend_user_id_required');

  const { error } = await supabase
    .from('friend_meta')
    .delete()
    .eq('owner_user_id', ownerUserId)
    .eq('friend_user_id', friendUserId);

  if (error) throw error;

  await forceRefreshGroups();
  return null;
}

export async function unfriend(friendId: string) {
  return removeFriend(friendId);
}

export async function setLabelMember(labelId: number, friendId: string, inGroup: boolean) {
  const res = await rpc('set_label_member_v1', {
    p_label_id: labelId,
    p_friend_id: friendId,
    p_in_group: inGroup,
  });
  await forceRefreshGroups();
  return res;
}

export async function createLabel(name: string) {
  const res = await rpc('create_label_v1', { p_name: name.trim() });
  await forceRefreshGroups();
  return res;
}

export async function renameLabel(labelId: number, name: string) {
  const res = await rpc('rename_label_v1', {
    p_label_id: labelId,
    p_name: name.trim(),
  });
  await forceRefreshGroups();
  return res;
}

export async function deleteLabel(labelId: number) {
  const res = await rpc('delete_label_v1', { label_id: labelId });
  await forceRefreshGroups();
  return res;
}

export async function setGroupFavorite(labelId: number, favorite: boolean) {
  const res = await rpc('set_group_favorite_v1', {
    p_label_id: labelId,
    p_is_favorite: favorite,
  });
  await forceRefreshGroups();
  return res;
}
