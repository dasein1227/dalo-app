import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { supabase } from '@/lib/supabase';
import {
  ensurePushTokenRegistered,
  handleSignedOutPushToken,
} from '@/lib/push/registerPushToken';

const FOREGROUND_RECHECK_MIN_INTERVAL_MS = 30_000;
const FOREGROUND_RECHECK_DEBOUNCE_MS = 1_000;

type RunOptions = {
  force?: boolean;
};

export default function PushTokenBootstrap() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingForceRef = useRef(false);
  const lastRunAtRef = useRef(0);

  const runEnsure = async (reason: string, options: RunOptions = {}) => {
    if (inFlightRef.current) {
      pendingForceRef.current = pendingForceRef.current || !!options.force;
      return;
    }

    const now = Date.now();
    if (!options.force && now - lastRunAtRef.current < FOREGROUND_RECHECK_MIN_INTERVAL_MS) {
      return;
    }

    inFlightRef.current = true;
    try {
      await ensurePushTokenRegistered({
        reason,
      });
      lastRunAtRef.current = Date.now();
    } catch (error) {
      console.warn('[push/bootstrap] ensure failed:', error, { reason });
    } finally {
      inFlightRef.current = false;

      if (pendingForceRef.current) {
        pendingForceRef.current = false;
        queueEnsure('coalesced', { force: true, delayMs: 350 });
      }
    }
  };

  const queueEnsure = (
    reason: string,
    options: {
      force?: boolean;
      delayMs?: number;
    } = {},
  ) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const delayMs = options.delayMs ?? FOREGROUND_RECHECK_DEBOUNCE_MS;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runEnsure(reason, { force: !!options.force }).catch((error) => {
        console.warn('[push/bootstrap] queued ensure failed:', error, { reason });
      });
    }, delayMs);
  };

  useEffect(() => {
    queueEnsure('bootstrap_mount', { force: true, delayMs: 300 });

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        queueEnsure('appstate_active', { force: false });
      }
    };

    const appStateSubscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      appStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const hasUser = !!session?.user?.id;

        if (event === 'SIGNED_OUT') {
          await handleSignedOutPushToken();
          return;
        }

        if (
          hasUser &&
          (event === 'INITIAL_SESSION' ||
            event === 'SIGNED_IN' ||
            event === 'TOKEN_REFRESHED' ||
            event === 'USER_UPDATED')
        ) {
          queueEnsure(`auth_${event.toLowerCase()}`, {
            force: event !== 'TOKEN_REFRESHED',
            delayMs: 150,
          });
        }
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return null;
}