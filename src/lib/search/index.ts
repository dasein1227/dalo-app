// src/lib/search/index.ts
import type { InterpretOptions, InterpretedQuery } from './types';
import { interpretQuery, type InterpretDeps } from './interpret';

export async function interpretOnly(
  text: string,
  options: InterpretOptions,
  deps?: InterpretDeps,
): Promise<InterpretedQuery> {
  return interpretQuery(text, options, deps);
}
