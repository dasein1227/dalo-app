import type { AiProvider } from '../types';

export class DisabledAiProvider implements AiProvider {
  readonly name = 'disabled' as const;

  async invoke<TResponse = any>(): Promise<TResponse> {
    throw new Error('AI provider is disabled.');
  }
}
