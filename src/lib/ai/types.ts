export type AiProviderName = 'supabase' | 'disabled';

/**
 * A small, stable surface area so we can swap providers (Grok/OpenAI/etc.)
 * without touching feature modules.
 */
export interface AiProvider {
  readonly name: AiProviderName;

  /**
   * Call a server-side AI capability by name, with a JSON payload.
   * For now we route through Supabase Edge Functions, but the interface
   * allows switching later.
   */
  invoke<TResponse = any>(
    fnName: string,
    body: Record<string, any>,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<TResponse>;
}

export type AiEnv = {
  provider: AiProviderName;
};
