import { getAiProvider } from './provider';

/**
 * Small wrapper to keep the callsites consistent.
 */
export async function aiInvoke<TResponse = any>(
  fnName: string,
  body: Record<string, any>,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<TResponse> {
  const provider = getAiProvider();
  return provider.invoke<TResponse>(fnName, body, opts);
}
