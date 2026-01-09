// src/lib/profileCache.ts
import { supabase } from './supabase';

// 앱에서 필요한 프로필 정보 타입
export type ProfLite = {
  nickname?: string | null;
  avatar_url?: string | null;
  follow_id?: string | null;

  // 송신 번역: 내가 보낼 때 어떤 언어로 번역할지
  preferred_lang?: string | null;

  // 수신 번역: 상대방이 보낸 메시지가 내 화면에 어떤 언어로 보일지
  view_lang?: string | null;

  // UI 기본 언어
  setting_lang?: string | null;

  // 번역 요금제 정보
  user_tier?: 'free' | 'mid' | 'high' | null;        
  translation_tier?: 'free' | 'mid' | 'high' | null; 
  translation_tone_default?: string | null;
};

// 내부 캐시
const cache: Record<string, ProfLite> = {};

// 여러 user_id 프로필 가져오기
export async function getProfiles(
  ids: string[]
): Promise<Record<string, ProfLite>> {
  const missing = ids.filter(id => !cache[id]);

  if (missing.length) {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        user_id,
        nickname,
        avatar_url,
        follow_id,
        preferred_lang,
        view_lang,
        setting_lang,
        user_tier,
        translation_tier,
        translation_tone_default
      `)
      .in('user_id', missing);

    if (error) {
      console.warn('[profileCache] fetch error:', error);
    }

    (data ?? []).forEach((p: any) => {
      cache[p.user_id] = {
        nickname: p.nickname,
        avatar_url: p.avatar_url,
        follow_id: p.follow_id,

        preferred_lang: p.preferred_lang,
        view_lang: p.view_lang,
        setting_lang: p.setting_lang,

        user_tier: p.user_tier,
        translation_tier: p.translation_tier,
        translation_tone_default: p.translation_tone_default,
      };
    });
  }

  const out: Record<string, ProfLite> = {};
  ids.forEach(id => {
    if (cache[id]) out[id] = cache[id];
  });

  return out;
}

// 단일 프로필 강제 새로고침
export async function refreshProfile(
  userId: string
): Promise<ProfLite | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      user_id,
      nickname,
      avatar_url,
      follow_id,
      preferred_lang,
      view_lang,
      setting_lang,
      user_tier,
      translation_tier,
      translation_tone_default
    `)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.warn('[profileCache] refresh error:', error);
    return null;
  }

  const prof: ProfLite = {
    nickname: data.nickname,
    avatar_url: data.avatar_url,
    follow_id: data.follow_id,

    preferred_lang: data.preferred_lang,
    view_lang: data.view_lang,
    setting_lang: data.setting_lang,

    user_tier: data.user_tier,
    translation_tier: data.translation_tier,
    translation_tone_default: data.translation_tone_default,
  };

  cache[userId] = prof;
  return prof;
}

// 번역 관련 설정만 부분 업데이트
export async function updateProfileTranslateSettings(
  userId: string,
  patch: {
    translation_tier?: 'free' | 'mid' | 'high';
    translation_tone_default?: string | null;
    preferred_lang?: string | null;
    view_lang?: string | null;    // ★ 추가됨
  }
): Promise<ProfLite | null> {
  if (!userId) return null;

  if (!patch || Object.keys(patch).length === 0)
    return cache[userId] ?? null;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select(`
      user_id,
      nickname,
      avatar_url,
      follow_id,
      preferred_lang,
      view_lang,
      setting_lang,
      user_tier,
      translation_tier,
      translation_tone_default
    `)
    .single();

  if (error) {
    console.warn(
      '[profileCache] updateProfileTranslateSettings error:',
      error
    );
    return null;
  }

  const prof: ProfLite = {
    nickname: data.nickname,
    avatar_url: data.avatar_url,
    follow_id: data.follow_id,

    preferred_lang: data.preferred_lang,
    view_lang: data.view_lang,
    setting_lang: data.setting_lang,

    user_tier: data.user_tier,
    translation_tier: data.translation_tier,
    translation_tone_default: data.translation_tone_default,
  };

  cache[userId] = prof;
  return prof;
}

// 캐시 초기화
export function clearProfileCache() {
  Object.keys(cache).forEach(key => delete cache[key]);
}
