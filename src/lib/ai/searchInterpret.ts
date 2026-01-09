import { aiInvoke } from './client';

/**
 * Optional: server-side interpret. Keep the output schema fixed.
 * You can keep using local lexicon for MVP and only use this when needed.
 */
export type AiInterpretResponse = {
  tags: Array<{ tag: string; score?: number; source?: string }>;
  intent?: string | null;
  time_hint?: string | null;
  language?: string | null;
};

export async function interpretSearchQuery(
  query: string,
  opts?: { locale?: string; signal?: AbortSignal; timeoutMs?: number },
): Promise<AiInterpretResponse> {
  return aiInvoke<AiInterpretResponse>(
    'ai-interpret',
    { query, locale: opts?.locale ?? null },
    { signal: opts?.signal, timeoutMs: opts?.timeoutMs },
  );
}
