// src/lib/i18n.ts
import i18n, { Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import ko from '../locales/ko.json';
import en from '../locales/en.json';
import ja from '../locales/ja.json';
import zh from '../locales/zh.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';
import id from '../locales/id.json';
import hi from '../locales/hi.json';
import ar from '../locales/ar.json';

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  ja: { translation: ja },
  zh: { translation: zh },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
  pt: { translation: pt },
  ru: { translation: ru },
  id: { translation: id },
  hi: { translation: hi },
  ar: { translation: ar },
} as const satisfies Resource;

type Lng = keyof typeof resources;
const fallbackLng: Lng = 'en';

// ✅ 최신 expo-localization 방식 (locale → getLocales)
function detectDeviceLng(): Lng {
  try {
    const locales = Localization.getLocales?.();
    // languageTag 예: "ko-KR", "en-US"
    const tag = locales && locales.length > 0 ? locales[0].languageTag : undefined;
    const base = (tag ?? 'en').split('-')[0] as keyof typeof resources;
    return (base in resources ? base : fallbackLng) as Lng;
  } catch {
    return fallbackLng;
  }
}

const initialLng: Lng = detectDeviceLng();

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: initialLng,
    fallbackLng,
    interpolation: { escapeValue: false },
    // 최신 타입과 충돌 피하려면 이 옵션은 생략하거나 'v4' 사용
    // compatibilityJSON: 'v4',
  });
}

export default i18n;
