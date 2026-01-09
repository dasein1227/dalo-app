// src/lib/social/followSummary.ts
import { supabase } from '@/lib/supabase';

export type FollowSummary = {
  followers: number;           // 나를 팔로우하는 사람 수
  following: number;           // 내가 팔로우하는 사람 수
  newFollowersLast24h: number; // 최근 24시간 새 팔로워
  outgoingRequests: number;    // 내가 보낸 친구/팔로우 요청 (pending)
  incomingRequests: number;    // 내가 받은 친구/팔로우 요청 (pending)
};

/**
 * 프로필 팔로우 및 친구 요청 관련 숫자들을 한 번에 가져오는 헬퍼
 * - followers / following 은 profile_follows
 * - outgoingRequests / incomingRequests 는 friendships (status = 'pending')
 */
export async function fetchFollowSummary(
  userId: string,
): Promise<FollowSummary> {
  try {
    const since24h = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    // 1) 팔로워 수 (following_id = me)
    const followersPromise = supabase
      .from('profile_follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId);

    // 2) 팔로잉 수 (follower_id = me)
    const followingPromise = supabase
      .from('profile_follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', userId);

    // 3) 최근 24시간 새 팔로워
    const newFollowersPromise = supabase
      .from('profile_follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId)
      .gte('created_at', since24h);

    // 4) 내가 보낸 친구 요청 (friendships.status = 'pending')
    //    ✅ 컬럼명: requester
    const outgoingPromise = supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('requester', userId)
      .eq('status', 'pending');

    // 5) 내가 받은 친구 요청
    //    ✅ 컬럼명: addressee
    const incomingPromise = supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee', userId)
      .eq('status', 'pending');

    const [
      { count: followersCount, error: followersError },
      { count: followingCount, error: followingError },
      { count: newFollowersCount, error: newFollowersError },
      { count: outgoingCount, error: outgoingError },
      { count: incomingCount, error: incomingError },
    ] = await Promise.all([
      followersPromise,
      followingPromise,
      newFollowersPromise,
      outgoingPromise,
      incomingPromise,
    ]);

    // 에러는 message 있을 때만 로그 찍기 (빈 객체/빈 문자열 방지)
    if (followersError?.message) {
      console.warn('fetchFollowSummary followers error', followersError);
    }
    if (followingError?.message) {
      console.warn('fetchFollowSummary following error', followingError);
    }
    if (newFollowersError?.message) {
      console.warn('fetchFollowSummary newFollowers error', newFollowersError);
    }
    if (outgoingError?.message) {
      console.warn('fetchFollowSummary outgoingRequests error', outgoingError);
    }
    if (incomingError?.message) {
      console.warn('fetchFollowSummary incomingRequests error', incomingError);
    }

    return {
      followers: followersCount ?? 0,
      following: followingCount ?? 0,
      newFollowersLast24h: newFollowersCount ?? 0,
      outgoingRequests: outgoingCount ?? 0,
      incomingRequests: incomingCount ?? 0,
    };
  } catch (e) {
    // 진짜 예외 터졌을 때만 한 번 찍고, 숫자는 0으로 리턴
    console.warn('fetchFollowSummary fatal error', e);
    return {
      followers: 0,
      following: 0,
      newFollowersLast24h: 0,
      outgoingRequests: 0,
      incomingRequests: 0,
    };
  }
}
