// src/lib/search/interpret.ts
import type { InterpretOptions, InterpretedQuery, InterpretedTag } from './types';
import { normalizeQueryText } from './normalize';
import type { AIProvider } from './providers/base';
import { DisabledAIProvider } from './providers/disabled';
import { getLexicon } from './lexicon';
import type { LexiconEntry, LexiconMatch } from './lexicon/types';

/**
 * Interpreter = (1) lexicon(dictionary) lookup + (2) optional AI merge.
 * The lexicon is data-only and can grow without touching the interpreter code.
 */

function mergeTags(a: InterpretedTag[], b: InterpretedTag[]): InterpretedTag[] {
  const map = new Map<string, InterpretedTag>();
  for (const t of [...a, ...b]) {
    const prev = map.get(t.tag);
    if (!prev) {
      map.set(t.tag, { ...t });
      continue;
    }
    map.set(t.tag, {
      tag: t.tag,
      kind: prev.kind ?? t.kind,
      score: Math.max(prev.score ?? 0, t.score ?? 0),
    });
  }
  return Array.from(map.values()).sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
}

function matchIncludes(text: string, value: string | string[]): boolean {
  const arr = Array.isArray(value) ? value : [value];
  for (const v of arr) {
    if (!v) continue;
    if (text.includes(v)) return true;
  }
  return false;
}

function matchRegex(text: string, value: RegExp | RegExp[]): boolean {
  const arr = Array.isArray(value) ? value : [value];
  for (const r of arr) {
    if (!r) continue;
    if (r.test(text)) return true;
  }
  return false;
}

function matches(text: string, m: LexiconMatch): boolean {
  if (m.type === 'includes') return matchIncludes(text, m.value);
  return matchRegex(text, m.value);
}

function applyLexicon(normalized: string, lexicon: LexiconEntry[]): InterpretedTag[] {
  let tags: InterpretedTag[] = [];
  for (const entry of lexicon) {
    if (matches(normalized, entry.match)) {
      tags = mergeTags(tags, entry.tags);
    }
  }
  return tags;
}

export type InterpretDeps = {
  /** Optional AI provider. If omitted, disabled provider is used. */
  aiProvider?: AIProvider;
};

export async function interpretQuery(
  raw: string,
  options: InterpretOptions,
  deps?: InterpretDeps,
): Promise<InterpretedQuery> {
  const normalized = normalizeQueryText(raw);

  const base: InterpretedQuery = {
    raw,
    normalized,
    tags: [],
    intents: [],
    isFallback: false,
    meta: { stage: 'lexicon-first' },
  };

  if (!normalized) {
    return { ...base, isFallback: true, meta: { ...base.meta, reason: 'empty' } };
  }

  const lexicon = getLexicon(options.locale ?? 'ko');
  const lexTags = applyLexicon(normalized, lexicon);

  const allowAI = options.allowAI !== false;
  const provider = deps?.aiProvider ?? new DisabledAIProvider();

  // AI disabled path
  if (!allowAI || provider.name === 'disabled') {
    return {
      ...base,
      tags: lexTags,
      isFallback: lexTags.length === 0,
      meta: { ...base.meta, provider: 'none' },
    };
  }

  // AI merge path
  try {
    const ai = await provider.analyzeQuery({
      raw,
      normalized,
      context: options.context,
      locale: options.locale ?? 'ko',
    });

    const merged = mergeTags(lexTags, ai.tags ?? []);
    const intents = Array.from(new Set([...(base.intents ?? []), ...(ai.intents ?? [])]));

    return {
      raw,
      normalized,
      tags: merged,
      intents,
      isFallback: merged.length === 0,
      meta: {
        ...base.meta,
        provider: provider.name,
        aiMeta: ai.meta ?? null,
      },
    };
  } catch (e: any) {
    // Fail closed: keep deterministic lexicon behavior
    return {
      ...base,
      tags: lexTags,
      isFallback: lexTags.length === 0,
      meta: { ...base.meta, provider: provider.name, aiError: String(e?.message ?? e) },
    };
  }
}
