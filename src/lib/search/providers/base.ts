// src/lib/search/providers/base.ts
import type { SearchContext, InterpretedQuery } from '../types';

export type AIAnalyzeQueryInput = {
  raw: string;
  normalized: string;
  context: SearchContext;
  locale?: string;
};

/**
 * AI provider contract.
 * Implementations must be deterministic in shape, even if model output varies.
 * IMPORTANT: Call this from server/edge in production; do NOT ship API keys in client.
 */
export interface AIProvider {
  readonly name: string;
  analyzeQuery(input: AIAnalyzeQueryInput): Promise<InterpretedQuery>;
}
