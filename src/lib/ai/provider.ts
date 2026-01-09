import { getAiEnv } from './env';
import type { AiProvider } from './types';
import { SupabaseAiProvider } from './providers/supabase';
import { DisabledAiProvider } from './providers/disabled';

/**
 * Provider singleton. Keep AI wiring out of screens.
 */
let _provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (_provider) return _provider;

  const env = getAiEnv();
  switch (env.provider) {
    case 'supabase':
      _provider = new SupabaseAiProvider();
      return _provider;
    case 'disabled':
      _provider = new DisabledAiProvider();
      return _provider;
    default:
      _provider = new SupabaseAiProvider();
      return _provider;
  }
}

/**
 * For tests / hot swapping in dev if needed.
 */
export function _setAiProviderForTest(p: AiProvider | null) {
  _provider = p;
}
