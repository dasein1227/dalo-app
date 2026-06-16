// src/lib/lang.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import { changeAppLanguage, initializeI18n } from '@/i18n';

/**
 * App language policy:
 * 1. User-selected language saved in APP_LANG
 * 2. Device language if it is one of CO·ONN's supported languages
 * 3. Fallback language
 *
 * profiles.preferred_lang is only a server mirror/default value.
 */
export type AppLang =
  | 'en'
  | 'ko'
  | 'ja'
  | 'zh-Hans'
  | 'zh-Hant'
  | 'es'
  | 'pt'
  | 'fr'
  | 'de'
  | 'id'
  | 'hi'
  | 'ru'
  | 'ar'
  | 'vi'
  | 'tr'
  | 'th'
  | 'it';

export type AppLanguageOption = {
  code: AppLang;
  native: string;
};

const KEY = 'APP_LANG';
const FALLBACK_APP_LANG: AppLang = 'en';

/**
 * Full CO·ONN language list.
 * Chinese is separated by script to avoid country-based labeling.
 */
export const LANGS: AppLanguageOption[] = [
  { code: 'en', native: 'English' },
  { code: 'ko', native: '한국어' },
  { code: 'ja', native: '日本語' },
  { code: 'zh-Hans', native: '简体中文' },
  { code: 'zh-Hant', native: '繁體中文' },
  { code: 'es', native: 'Español' },
  { code: 'pt', native: 'Português' },
  { code: 'fr', native: 'Français' },
  { code: 'de', native: 'Deutsch' },
  { code: 'id', native: 'Bahasa Indonesia' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'ru', native: 'Русский' },
  { code: 'ar', native: 'العربية' },
  { code: 'vi', native: 'Tiếng Việt' },
  { code: 'tr', native: 'Türkçe' },
  { code: 'th', native: 'ไทย' },
  { code: 'it', native: 'Italiano' },
];

const SUPPORTED_APP_LANGS = new Set<AppLang>(LANGS.map((item) => item.code));

function isAppLang(value: unknown): value is AppLang {
  return typeof value === 'string' && SUPPORTED_APP_LANGS.has(value as AppLang);
}

function normalizeChineseLang(value: string): AppLang | null {
  const normalized = value.trim().replace(/_/g, '-');
  const lower = normalized.toLowerCase();

  if (!lower) return null;

  // Legacy saved value and generic device language default to Simplified Chinese.
  if (lower === 'zh') return 'zh-Hans';

  // Simplified Chinese regions / script.
  if (
    lower === 'zh-hans' ||
    lower === 'zh-cn' ||
    lower === 'zh-sg' ||
    lower === 'zh-my' ||
    lower.startsWith('zh-hans-')
  ) {
    return 'zh-Hans';
  }

  // Traditional Chinese regions / script.
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

function normalizeAppLang(value: unknown): AppLang | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().replace(/_/g, '-');
  if (!normalized) return null;

  const chinese = normalizeChineseLang(normalized);
  if (chinese) return chinese;

  const primary = normalized.split('-')[0]?.toLowerCase();
  return isAppLang(primary) ? primary : null;
}

/** Memory cache for synchronous access. */
let currentLang: AppLang = FALLBACK_APP_LANG;

export function getLangMemory(): AppLang {
  return currentLang;
}

export function setLangMemory(code: AppLang) {
  currentLang = normalizeAppLang(code) ?? FALLBACK_APP_LANG;
}

/** Device language -> CO·ONN supported language. */
function detectDeviceLang(): AppLang {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || FALLBACK_APP_LANG;
    return normalizeAppLang(locale) ?? FALLBACK_APP_LANG;
  } catch {
    return FALLBACK_APP_LANG;
  }
}

/** Load saved language. If not found, use device language, then fallback. */
export async function getInitialLang(): Promise<AppLang> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    const savedLang = normalizeAppLang(saved);

    if (savedLang) {
      // Migrate legacy / region-specific values into CO·ONN's canonical language codes.
      if (saved !== savedLang) {
        await AsyncStorage.setItem(KEY, savedLang).catch(() => {});
      }
      return savedLang;
    }

    if (saved) {
      await AsyncStorage.removeItem(KEY).catch(() => {});
    }

    return detectDeviceLang();
  } catch {
    return detectDeviceLang();
  }
}

/** Save language only. */
export async function saveLang(code: AppLang) {
  const nextLang = normalizeAppLang(code) ?? FALLBACK_APP_LANG;

  try {
    await AsyncStorage.setItem(KEY, nextLang);
  } catch (e) {
    console.warn('saveLang error', e);
  }
}

/** Save + memory cache + i18n change. */
export async function applyLanguage(code: AppLang): Promise<AppLang> {
  const nextLang = normalizeAppLang(code) ?? FALLBACK_APP_LANG;

  await saveLang(nextLang);
  setLangMemory(nextLang);

  try {
    await changeAppLanguage(nextLang);
  } catch (e) {
    console.warn('changeLanguage error', e);
  }

  return nextLang;
}

/** Apply saved language on app start. */
export async function initLanguage(): Promise<AppLang> {
  const initial = await getInitialLang();
  setLangMemory(initial);

  try {
    await initializeI18n({ initialLanguage: initial });
    await changeAppLanguage(initial);
  } catch (e) {
    console.warn('initLanguage error', e);
  }

  return initial;
}

/** Current language index for settings UI. */
export function getCurrentLangIndex(): number {
  return Math.max(0, LANGS.findIndex((item) => item.code === currentLang));
}
