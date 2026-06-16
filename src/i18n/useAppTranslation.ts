import { useTranslation } from 'react-i18next';

import { DEFAULT_NAMESPACE, type I18nNamespace } from './namespaces';

export function useAppTranslation(ns: I18nNamespace | readonly I18nNamespace[] = DEFAULT_NAMESPACE) {
  return useTranslation(ns as I18nNamespace | I18nNamespace[]);
}
