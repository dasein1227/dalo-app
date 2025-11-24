// src/hooks/useNotifBadge.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const TABLE_NAME = 'app_notifications'; // 'notifications'로 쓰면 교체

export function useNotifBadge() {
  const [count, setCount] = useState<number>(0);

  async function fetchUnread() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCount(0); return; }

      // read_at이 있는 테이블에서만 카운트. 없으면 0 처리.
      const probe = await supabase.from(TABLE_NAME).select('read_at').limit(1);
      const hasReadAt = !probe.error && Array.isArray(probe.data) && probe.data.length > 0 && (probe.data[0] as any).read_at !== undefined;

      if (!hasReadAt) { setCount(0); return; }

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) { setCount(0); return; }
      setCount((data as any)?.length ?? (typeof (data as any)?.count === 'number' ? (data as any).count : 0));
    } catch {
      setCount(0);
    }
  }

  useEffect(() => {
    let mounted = true;
    fetchUnread();

    // Realtime: INSERT/UPDATE 구독 (내 user_id에 한정)
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const channel = supabase
        .channel('notif-badge')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME, filter: `user_id=eq.${user.id}` }, () => {
          if (!mounted) return;
          fetchUnread();
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    })();

    return () => { mounted = false; };
  }, []);

  return { count, refresh: fetchUnread };
}
