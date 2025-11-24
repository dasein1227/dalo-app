// src/lib/lang.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from './i18n'; // ← 반드시 존재해야 함 (resources 등록은 i18n.ts에서)
 
/** 앱이 지원하는 언어 코드 */
export type AppLang =
  | 'ar' | 'de' | 'en' | 'es' | 'fr' | 'hi'
  | 'id' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh';

const KEY = 'APP_LANG';

/** 설정 화면 등에서 쓸 언어 목록 */
export const LANGS: { code: AppLang; native: string }[] = [
  { code: 'ar', native: 'العربية' },
  { code: 'de', native: 'Deutsch' },
  { code: 'en', native: 'English' },
  { code: 'es', native: 'Español' },
  { code: 'fr', native: 'Français' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'id', native: 'Bahasa Indonesia' },
  { code: 'ja', native: '日本語' },
  { code: 'ko', native: '한국어' },
  { code: 'pt', native: 'Português' },
  { code: 'ru', native: 'Русский' },
  { code: 'zh', native: '中文' },
];

/** 메모리 캐시 (동기 접근용) */
let currentLang: AppLang = 'en';
export function getLangMemory(): AppLang { return currentLang; }
export function setLangMemory(code: AppLang) { currentLang = code; }

/** 디바이스 기본 언어 감지 → 지원 안 하면 en */
function detectDeviceLang(): AppLang {
  try {
    const lc = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
    const base = lc.split('-')[0] as AppLang;
    const supported = LANGS.map(l => l.code);
    return (supported as string[]).includes(base) ? (base as AppLang) : 'en';
  } catch {
    return 'en';
  }
}

/** 저장된 언어코드 불러오기 (없으면 디바이스 기본값) */
export async function getInitialLang(): Promise<AppLang> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved && (LANGS as any[]).some(l => l.code === saved)) {
      return saved as AppLang;
    }
    return detectDeviceLang();
  } catch {
    return detectDeviceLang();
  }
}

/** 언어 저장만(변경은 안 함) */
export async function saveLang(code: AppLang) {
  try {
    await AsyncStorage.setItem(KEY, code);
  } catch (e) {
    console.warn('saveLang error', e);
  }
}

/** i18n까지 적용(저장 + 메모리 캐시 + i18n 변경) */
export async function applyLanguage(code: AppLang) {
  await saveLang(code);
  setLangMemory(code);
  // i18n 리소스가 로드되어 있다면 즉시 반영
  try {
    if (i18n.isInitialized) await i18n.changeLanguage(code);
  } catch (e) {
    console.warn('changeLanguage error', e);
  }
}

/**
 * 앱 시작 시 한 번 호출해서 언어 적용
 * - App.tsx에서 i18n.ts import 후, useEffect로 initLanguage() 한 번만 호출 추천
 */
export async function initLanguage() {
  const initial = await getInitialLang();
  setLangMemory(initial);
  try {
    if (i18n.isInitialized) {
      await i18n.changeLanguage(initial);
    } else {
      // i18n.ts가 늦게 초기화되는 경우 대비: 다음 틱에 적용
      setTimeout(() => i18n.changeLanguage(initial).catch(() => {}), 0);
    }
  } catch {}
}

/** 설정 화면에서 현재 언어가 목록 몇 번째인지 필요할 때 */
export function getCurrentLangIndex(): number {
  return Math.max(0, LANGS.findIndex(l => l.code === currentLang));
}
