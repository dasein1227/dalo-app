import type { Resource } from 'i18next';

// Important: keep the explicit /index import.
// If src/locales/ko.json still exists during migration, importing '../locales/ko'
// can resolve to that old file instead of the new namespace folder.
import ko from '../locales/ko/index';
import en from '../locales/en/index';
import ja from '../locales/ja/index';
import zhHans from '../locales/zh-Hans/index';
import zhHant from '../locales/zh-Hant/index';
import es from '../locales/es/index';
import pt from '../locales/pt/index';
import fr from '../locales/fr/index';
import de from '../locales/de/index';
import ru from '../locales/ru/index';
import id from '../locales/id/index';
import hi from '../locales/hi/index';
import ar from '../locales/ar/index';
import vi from '../locales/vi/index';
import tr from '../locales/tr/index';
import th from '../locales/th/index';
import it from '../locales/it/index';

import { FALLBACK_LANGUAGE, type SupportedLanguage } from './languages';
import { normalizeLanguage } from './normalizeLanguage';

export const resources = {
  ko,
  en,
  ja,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  es,
  pt,
  fr,
  de,
  ru,
  id,
  hi,
  ar,
  vi,
  tr,
  th,
  it,
} as const;

export type LoadedLanguage = keyof typeof resources;
export type AppI18nResources = typeof resources;
export type AppI18nResource = (typeof resources)[LoadedLanguage];

export const LOADED_LANGUAGES = Object.keys(resources) as LoadedLanguage[];

export function hasLoadedLanguage(value: unknown): value is LoadedLanguage {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(resources, value);
}

function normalizeChineseLoadedLanguage(value: string): LoadedLanguage | null {
  const normalized = value.trim().replace(/_/g, '-');
  const lower = normalized.toLowerCase();

  if (!lower) return null;

  // Legacy / generic Chinese defaults to Simplified Chinese.
  if (lower === 'zh') return 'zh-Hans';

  // Simplified Chinese script / regions.
  if (
    lower === 'zh-hans' ||
    lower === 'zh-cn' ||
    lower === 'zh-sg' ||
    lower === 'zh-my' ||
    lower.startsWith('zh-hans-')
  ) {
    return 'zh-Hans';
  }

  // Traditional Chinese script / regions.
  if (
    lower === 'zh-hant' ||
    lower === 'zh-tw' ||
    lower === 'zh-hk' ||
    lower === 'zh-mo' ||
    lower.startsWith('zh-hant-')
  ) {
    return 'zh-Hant';
  }

  return null;
}

function normalizeLoadedLanguage(input?: string | null): string | null {
  if (typeof input !== 'string') return null;

  const chinese = normalizeChineseLoadedLanguage(input);
  if (chinese) return chinese;

  const normalized = normalizeLanguage(input);

  // Guard against older normalizeLanguage implementations that collapse
  // zh-Hans / zh-Hant / zh-CN / zh-TW into plain "zh".
  if (normalized === 'zh') return 'zh-Hans';

  return normalized;
}

export function resolveLoadedLanguage(input?: string | null): LoadedLanguage {
  const normalized = normalizeLoadedLanguage(input);
  if (hasLoadedLanguage(normalized)) return normalized;

  if (hasLoadedLanguage(FALLBACK_LANGUAGE)) return FALLBACK_LANGUAGE as LoadedLanguage;

  return LOADED_LANGUAGES[0];
}

export function getI18nResourceBundle(): Resource {
  return resources as unknown as Resource;
}

export function isLanguageBundled(language: SupportedLanguage): boolean {
  return hasLoadedLanguage(language);
}
