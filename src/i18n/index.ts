import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { FALLBACK_LANGUAGE, LANGUAGE_META, ENABLE_RTL_LAYOUT } from './languages';
import { DEFAULT_NAMESPACE, I18N_NAMESPACES } from './namespaces';
import { getI18nResourceBundle, LOADED_LANGUAGES, resolveLoadedLanguage, type LoadedLanguage } from './resources';

export type InitializeI18nOptions = {
  /** App setting, profiles.preferred_lang, or device locale. */
  initialLanguage?: string | null;
};

let initialized = false;

export async function initializeI18n(options: InitializeI18nOptions = {}): Promise<typeof i18n> {
  const language = resolveLoadedLanguage(options.initialLanguage);

  if (initialized || i18n.isInitialized) {
    if (i18n.language !== language) {
      await i18n.changeLanguage(language);
    }
    initialized = true;
    return i18n;
  }

  await i18n.use(initReactI18next).init({
    resources: getI18nResourceBundle(),
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    defaultNS: DEFAULT_NAMESPACE,
    ns: I18N_NAMESPACES,
    supportedLngs: LOADED_LANGUAGES,
    // Keep full locale codes such as zh-Hans / zh-Hant.
    // languageOnly collapses them to plain zh, which has no resource bundle.
    load: 'currentOnly',
    cleanCode: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

  initialized = true;
  return i18n;
}

export async function changeAppLanguage(nextLanguage?: string | null): Promise<LoadedLanguage> {
  const language = resolveLoadedLanguage(nextLanguage);

  if (!initialized && !i18n.isInitialized) {
    await initializeI18n({ initialLanguage: language });
    return language;
  }

  if (i18n.language !== language) {
    await i18n.changeLanguage(language);
  }

  return language;
}

export function getCurrentAppLanguage(): LoadedLanguage {
  return resolveLoadedLanguage(i18n.language);
}

export function getCurrentLanguageDirection(): 'ltr' | 'rtl' {
  const language = getCurrentAppLanguage();
  const direction = LANGUAGE_META[language]?.direction ?? 'ltr';

  if (direction === 'rtl' && !ENABLE_RTL_LAYOUT) {
    return 'ltr';
  }

  return direction;
}

// Start i18n immediately with the bundled fallback language.
// App bootstrap can call initializeI18n({ initialLanguage }) again after loading
// the saved app language / profiles.preferred_lang / device locale.
void initializeI18n();

export { i18n };
export default i18n;
