import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import { supabase } from '@/lib/supabase';

let __meUidCache: string | null = null;
let __meUidInflight: Promise<string | null> | null = null;

export async function fetchMeUidCached(): Promise<string | null> {
  if (__meUidCache) return __meUidCache;
  if (__meUidInflight) return __meUidInflight;

  __meUidInflight = (async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      const uid = String(data?.user?.id ?? '').trim() || null;
      __meUidCache = uid;
      return uid;
    } catch {
      return null;
    } finally {
      __meUidInflight = null;
    }
  })();

  return __meUidInflight;
}

export function useMeUid(
  scrollingRef?: React.MutableRefObject<boolean>,
  injectedMeUid?: string | null,
) {
  const controlled = injectedMeUid !== undefined;
  const [meUid, setMeUid] = useState<string | null>(() => {
    if (controlled) return injectedMeUid ?? null;
    return __meUidCache;
  });

  useEffect(() => {
    if (controlled) {
      setMeUid(injectedMeUid ?? null);
      return;
    }
    if (meUid) return;
    if (scrollingRef?.current) return;

    let alive = true;
    const task = InteractionManager.runAfterInteractions(() => {
      fetchMeUidCached().then((uid) => {
        if (!alive) return;
        if (uid) setMeUid(uid);
      });
    });

    return () => {
      alive = false;
      try {
        (task as any)?.cancel?.();
      } catch {}
    };
  }, [controlled, injectedMeUid, meUid, scrollingRef]);

  return controlled ? (injectedMeUid ?? null) : meUid;
}
