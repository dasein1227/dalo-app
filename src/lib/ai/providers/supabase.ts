import type { AiProvider } from '../types';
import { supabase } from '@/lib/supabase';

/**
 * Supabase Edge Functions backed provider.
 * This keeps all invoke + error normalization in one place.
 */
export class SupabaseAiProvider implements AiProvider {
  readonly name = 'supabase' as const;

  async invoke<TResponse = any>(
    fnName: string,
    body: Record<string, any>,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<TResponse> {
    const timeoutMs = opts?.timeoutMs ?? 20_000;

    const ac = new AbortController();
    const onAbort = () => ac.abort();
    opts?.signal?.addEventListener('abort', onAbort);

    const timer = setTimeout(() => {
      try { ac.abort(); } catch {}
    }, timeoutMs);

    try {
      const { data, error } = await supabase.functions.invoke(fnName, {
        body,
        // NOTE: supabase-js supports passing signal in recent versions.
        // If your version doesn't, it's harmless to include; it will be ignored.
        signal: ac.signal as any,
      } as any);

      if (error) {
        const msg = (error as any)?.message || 'Edge Function invocation failed';
        const status = (error as any)?.status;
        const details = (error as any)?.details || (error as any)?.context;
        const err = new Error(msg);
        (err as any).status = status;
        (err as any).details = details;
        throw err;
      }

      return data as TResponse;
    } finally {
      clearTimeout(timer);
      opts?.signal?.removeEventListener('abort', onAbort);
    }
  }
}
