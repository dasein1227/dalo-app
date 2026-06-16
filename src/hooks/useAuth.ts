// src/hooks/useAuth.ts
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '../stores/authStore';

export function useAuthBootstrap() {
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [setSession]);
}

