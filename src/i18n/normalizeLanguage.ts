import { FALLBACK_LANGUAGE, type SupportedLanguage } from './languages';

const LANGUAGE_ALIAS_MAP: Record<string, SupportedLanguage> = {
  en: 'en',
  ko: 'ko',
  kr: 'ko',
  ja: 'ja',
  jp: 'ja',
  zh: 'zh',
  cn: 'zh',
  es: 'es',
  pt: 'pt',
  fr: 'fr',
  de: 'de',
  id: 'id',
  in: 'id',
  hi: 'hi',
  ru: 'ru',
  ar: 'ar',
  vi: 'vi',
  tr: 'tr',
  th: 'th',
  it: 'it',
};

/**
 * Normalizes app/profile/device locale values to CO·ONN's supported app language code.
 *
 * Examples:
 * - ko-KR -> ko
 * - en_US -> en
 * - zh-Hans-CN -> zh
 * - pt-BR -> pt
 */
export function normalizeLanguage(input?: string | null): SupportedLanguage {
  if (!input) return FALLBACK_LANGUAGE;

  const normalized = String(input).trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) return FALLBACK_LANGUAGE;

  const exact = LANGUAGE_ALIAS_MAP[normalized];
  if (exact) return exact;

  const primary = normalized.split('-')[0];
  return LANGUAGE_ALIAS_MAP[primary] ?? FALLBACK_LANGUAGE;
}
