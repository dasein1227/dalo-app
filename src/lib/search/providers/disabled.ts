// src/lib/search/providers/disabled.ts
import type { AIProvider, AIAnalyzeQueryInput } from './base';
import type { InterpretedQuery } from '../types';

/**
 * Placeholder provider that never calls an external API.
 * Use this for MVP while wiring the rest of the pipeline.
 */
export class DisabledAIProvider implements AIProvider {
  readonly name = 'disabled';

  async analyzeQuery(input: AIAnalyzeQueryInput): Promise<InterpretedQuery> {
    return {
      raw: input.raw,
      normalized: input.normalized,
      tags: [],
      intents: [],
      isFallback: true,
      meta: { provider: this.name },
    };
  }
}
