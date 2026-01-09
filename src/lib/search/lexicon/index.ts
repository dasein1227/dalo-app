// src/lib/search/lexicon/index.ts
import type { LexiconEntry } from './types';
import { KO_LEXICON } from './ko';

export function getLexicon(locale?: string): LexiconEntry[] {
  const lc = (locale ?? 'ko').toLowerCase();
  if (lc.startsWith('ko')) return KO_LEXICON;
  return KO_LEXICON;
}
