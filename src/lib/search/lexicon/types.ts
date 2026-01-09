// src/lib/search/lexicon/types.ts
import type { InterpretedTag } from '../types';

export type LexiconMatch =
  | { type: 'includes'; value: string | string[] }   // substring match (fast)
  | { type: 'regex'; value: RegExp | RegExp[] };     // regex match

export type LexiconEntry = {
  /** Human-readable id for maintenance */
  id: string;
  /** How to match against normalized query text */
  match: LexiconMatch;
  /** Tags emitted when matched */
  tags: InterpretedTag[];
};
