import type { AiEnv, AiProviderName } from './types';

/**
 * Centralized AI configuration. Keep it simple and deterministic.
 * If you later want "키만 바꾸면 다른 AI", implement that inside provider selection.
 */
export function getAiEnv(): AiEnv {
  const provider = (process.env.EXPO_PUBLIC_AI_PROVIDER ?? 'supabase') as AiProviderName;
  return { provider };
}
