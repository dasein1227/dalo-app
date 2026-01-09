// src/lib/search/types.ts
// CO·ONN unified search types (AI-pluggable interpreter)

export type SearchContext = 'main' | 'feed' | 'beacon';

export type InterpretedTagKind =
  | 'sensory'
  | 'food'
  | 'place'
  | 'activity'
  | 'time'
  | 'other';

export type InterpretedTag = {
  /** Stable canonical tag (used across providers). Example: SENSORY_RICH, FOOD_PORK_BELLY */
  tag: string;
  /** Optional type hint for UI/analytics */
  kind?: InterpretedTagKind;
  /** Confidence score [0..1] */
  score?: number;
};

export type InterpretedQuery = {
  /** Original user input */
  raw: string;
  /** Normalized text used for matching */
  normalized: string;
  /** Primary interpreted tags (canonical) */
  tags: InterpretedTag[];
  /** Optional free-form intents (canonical) */
  intents?: string[];
  /** Debug / provider metadata (do not show to users) */
  meta?: Record<string, any>;
  /** If true, interpreter could not infer anything; caller should fallback to keyword search */
  isFallback?: boolean;
};

export type InterpretOptions = {
  context: SearchContext;
  locale?: 'ko' | 'en' | string;
  /** If true, allow AI provider (when configured). Default true. */
  allowAI?: boolean;
};
