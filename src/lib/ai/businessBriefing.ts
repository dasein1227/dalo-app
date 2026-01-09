import { aiInvoke } from './client';

/**
 * Response contract for the existing Edge Function (ai-briefing).
 * Expand this over time to include profile(tags/weights/evidence) alongside briefing text.
 */
export type AiBriefingResponse = {
  briefing?: string | null;
  updated_at?: string | null;
  // Future:
  // profile?: any;
};

export async function generateBusinessBriefing(
  businessId: string | number,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<AiBriefingResponse> {
  return aiInvoke<AiBriefingResponse>(
    'ai-briefing',
    { businessId },
    opts,
  );
}
