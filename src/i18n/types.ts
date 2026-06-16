import type { TFunction } from 'i18next';

import type { SupportedLanguage } from './languages';
import type { I18nNamespace } from './namespaces';
import type { AppI18nResource, LoadedLanguage } from './resources';

export type AppLanguage = SupportedLanguage;
export type AppLoadedLanguage = LoadedLanguage;
export type AppNamespace = I18nNamespace;
export type AppTranslationTree = AppI18nResource;
export type AppTFunction = TFunction;

export type PrimitiveTranslationValue = string | number | boolean | null;
export type TranslationObject = {
  readonly [key: string]: PrimitiveTranslationValue | TranslationObject;
};
