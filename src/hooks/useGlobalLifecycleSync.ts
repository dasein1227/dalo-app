import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { scheduleSyncChatRooms } from '@/lib/chatSync/roomSync';

type Options = {
  foregroundDelayMs?: number;
};

const DEFAULT_FOREGROUND_DELAY_MS = 500;

export function useGlobalLifecycleSync(
  isReady: boolean = true,
  options: Options = {},
) {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!isReady) return;

    const foregroundDelayMs =
      typeof options.foregroundDelayMs === 'number' && options.foregroundDelayMs >= 0
        ? Math.trunc(options.foregroundDelayMs)
        : DEFAULT_FOREGROUND_DELAY_MS;

    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        const movedToForeground =
          appState.current.match(/inactive|background/) && nextAppState === 'active';

        if (movedToForeground) {
          scheduleSyncChatRooms('app_foreground', {
            delayMs: foregroundDelayMs,
            force: true,
            minIntervalMs: 0,
          });
        }

        appState.current = nextAppState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [isReady, options.foregroundDelayMs]);
}
