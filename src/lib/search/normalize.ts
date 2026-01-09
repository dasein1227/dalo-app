// src/lib/search/normalize.ts

/**
 * Minimal, deterministic normalization.
 * - trims
 * - collapses whitespace
 * - lowercases (for latin)
 * - keeps Hangul as-is
 */
export function normalizeQueryText(input: string): string {
  const raw = (input ?? '').toString();
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // collapse whitespace
  const collapsed = trimmed.replace(/\s+/g, ' ');
  // lowercase latin only (safe for mixed text)
  return collapsed.toLowerCase();
}
