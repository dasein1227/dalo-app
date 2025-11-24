// src/hooks/useRooms.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabase';
import { haversineMeters } from '../utils/geo';

type Room = {
  id: number;
  title: string;
  lat: number | null;
  lng: number | null;
  is_published: boolean | null;
  published_until: string | null;
};

export function useNearbyRooms(myLat?: number, myLng?: number, radiusM = 120) {
  return useQuery({
    queryKey: ['rooms', myLat, myLng, radiusM],
    enabled: !!myLat && !!myLng,
    queryFn: async () => {
      // 최소 쿼리: 최근 공개된 방만 가져오고, 거리 필터는 클라에서 1차
      const { data, error } = await supabase
        .from('rooms')
        .select('id,title,lat,lng,is_published,published_until')
        .eq('is_published', true)
        .gt('published_until', new Date().toISOString())
        .limit(200);
      if (error) throw error;

      return (data ?? []).filter(
        (r) =>
          r.lat != null &&
          r.lng != null &&
          haversineMeters(myLat!, myLng!, r.lat!, r.lng!) <= radiusM
      );
    },
    staleTime: 5000,
  });
}
