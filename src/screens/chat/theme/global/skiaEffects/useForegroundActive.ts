// src/screens/chat/theme/global/skiaEffects/useForegroundActive.ts
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export function useForegroundActive() {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => setActive(next === 'active');
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return active;
}
