export const SUPPORTED_LANGUAGES = [
  'en',
  'ko',
  'ja',
  'zh',
  'es',
  'pt',
  'fr',
  'de',
  'id',
  'hi',
  'ru',
  'ar',
  'vi',
  'tr',
  'th',
  'it',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguageDirection = 'ltr' | 'rtl';

/**
 * KO-only bootstrap fallback.
 *
 * CO·ONN's final global fallback should be 'en', but the English namespace files
 * are not ready yet. Keep this as 'ko' until src/locales/en/* is completed.
 */
export const FALLBACK_LANGUAGE: SupportedLanguage = 'ko';

/**
 * RTL resources can exist before full RTL layout support is enabled.
 * Keep layout direction LTR in v1, then enable RTL only after screen-by-screen QA.
 */
export const ENABLE_RTL_LAYOUT = false;

export const LANGUAGE_META: Record<
  SupportedLanguage,
  {
    label: string;
    nativeLabel: string;
    direction: LanguageDirection;
  }
> = {
  en: { label: 'English', nativeLabel: 'English', direction: 'ltr' },
  ko: { label: 'Korean', nativeLabel: '한국어', direction: 'ltr' },
  ja: { label: 'Japanese', nativeLabel: '日本語', direction: 'ltr' },
  zh: { label: 'Chinese', nativeLabel: '中文', direction: 'ltr' },
  es: { label: 'Spanish', nativeLabel: 'Español', direction: 'ltr' },
  pt: { label: 'Portuguese', nativeLabel: 'Português', direction: 'ltr' },
  fr: { label: 'French', nativeLabel: 'Français', direction: 'ltr' },
  de: { label: 'German', nativeLabel: 'Deutsch', direction: 'ltr' },
  id: { label: 'Indonesian', nativeLabel: 'Bahasa Indonesia', direction: 'ltr' },
  hi: { label: 'Hindi', nativeLabel: 'हिन्दी', direction: 'ltr' },
  ru: { label: 'Russian', nativeLabel: 'Русский', direction: 'ltr' },
  ar: { label: 'Arabic', nativeLabel: 'العربية', direction: 'rtl' },
  vi: { label: 'Vietnamese', nativeLabel: 'Tiếng Việt', direction: 'ltr' },
  tr: { label: 'Turkish', nativeLabel: 'Türkçe', direction: 'ltr' },
  th: { label: 'Thai', nativeLabel: 'ไทย', direction: 'ltr' },
  it: { label: 'Italian', nativeLabel: 'Italiano', direction: 'ltr' },
};

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}
