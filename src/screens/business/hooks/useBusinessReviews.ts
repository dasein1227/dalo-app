import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { BusinessReview } from '../components/businessTypes';

export function useBusinessReviews(businessId: string | null) {
  const [reviews, setReviews] = useState<BusinessReview[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReviews = useCallback(async () => {
    if (!businessId) return;

    try {
      setLoading(true);
      
      // ✅ [최종 수정] 
      // 1. SELECT에서 'id' 제거 (테이블에 없음)
      // 2. post_media ( file_url ) 요청
      // 3. user 관계 명시 (!posts_user_id_fkey)
      const { data, error } = await supabase
        .from('business_post_tags')
        .select(`
          post_id,
          created_at,
          post:posts (
            id,
            caption, 
            post_media (
              file_url
            ),
            created_at,
            user_id,
            user:profiles!posts_user_id_fkey (
              nickname,
              avatar_url
            )
          )
        `)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // post가 null이 아닌 것만 필터링
      const validReviews = (data as any[]).filter(item => item.post !== null);
      setReviews(validReviews);

    } catch (e) {
      console.error('Reviews Fetch Error:', e);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const replyToReview = useCallback(async (postId: string, comment: string) => {
    // 답글 로직 (추후 구현)
  }, []);

  return {
    reviews,
    loading,
    refreshReviews: fetchReviews,
    replyToReview,
  };
}