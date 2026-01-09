// src/lib/search/lexicon/ko.ts
import type { LexiconEntry } from './types';

/**
 * KO Lexicon (Korean) - data-only.
 * Keep this file as "the dictionary" that can grow over time.
 * Prefer simple includes() terms where possible.
 * Use regex only for patterns that truly need it.
 */
export const KO_LEXICON: LexiconEntry[] = [
  // -------------------------
  // Sensory / vibe (감각/분위기)
  // -------------------------
  {
    id: 'sensory_rich_greasy_creamy',
    match: { type: 'includes', value: ['느끼', '느끼한', '기름진', '크리미', '크림'] },
    tags: [
      { tag: 'SENSORY_RICH', kind: 'sensory', score: 0.8 },
      { tag: 'SENSORY_GREASY', kind: 'sensory', score: 0.75 },
      { tag: 'SENSORY_CREAMY', kind: 'sensory', score: 0.65 },
    ],
  },
  {
    id: 'sensory_light_clean',
    match: { type: 'includes', value: ['담백', '깔끔', '가벼운', '개운'] },
    tags: [
      { tag: 'SENSORY_LIGHT', kind: 'sensory', score: 0.75 },
      { tag: 'SENSORY_CLEAN', kind: 'sensory', score: 0.7 },
    ],
  },
  {
    id: 'sensory_spicy',
    match: { type: 'includes', value: ['매운', '매콤', '얼큰', '매워'] },
    tags: [
      { tag: 'SENSORY_SPICY', kind: 'sensory', score: 0.8 },
      { tag: 'SENSORY_HEARTY', kind: 'sensory', score: 0.6 },
    ],
  },
  {
    id: 'vibe_quiet_relax',
    match: { type: 'includes', value: ['조용', '한적', '차분', '힐링', '휴식', '편한', '편하게'] },
    tags: [
      { tag: 'VIBE_QUIET', kind: 'other', score: 0.75 },
      { tag: 'VIBE_RELAX', kind: 'other', score: 0.75 },
    ],
  },
  {
    id: 'vibe_loud_party',
    match: { type: 'includes', value: ['시끄', '신나', '흥', '파티', '클럽'] },
    tags: [
      { tag: 'VIBE_LOUD', kind: 'other', score: 0.7 },
      { tag: 'VIBE_PARTY', kind: 'other', score: 0.75 },
    ],
  },
  {
    id: 'vibe_romantic_date',
    match: { type: 'regex', value: [/(데이트)/, /(로맨틱)/, /(분위기\s*좋)/] },
    tags: [
      { tag: 'VIBE_ROMANTIC', kind: 'other', score: 0.75 },
      { tag: 'INTENT_DATE', kind: 'activity', score: 0.7 },
    ],
  },

  // -------------------------
  // Food / drink (먹거리)
  // -------------------------
  {
    id: 'food_pork_belly_kbbq',
    match: { type: 'regex', value: [/(삼겹살)/, /(돼지\s*고기|돼지고기)/, /(고기집)/, /(바베큐)/] },
    tags: [
      { tag: 'FOOD_PORK_BELLY', kind: 'food', score: 0.85 },
      { tag: 'FOOD_KBBQ', kind: 'food', score: 0.75 },
    ],
  },
  {
    id: 'food_chicken',
    match: { type: 'includes', value: ['치킨', '후라이드', '양념치킨'] },
    tags: [{ tag: 'FOOD_CHICKEN', kind: 'food', score: 0.8 }],
  },
  {
    id: 'food_pizza',
    match: { type: 'includes', value: ['피자'] },
    tags: [{ tag: 'FOOD_PIZZA', kind: 'food', score: 0.8 }],
  },
  {
    id: 'food_western_pasta',
    match: { type: 'includes', value: ['파스타', '스파게티', '리조또', '양식'] },
    tags: [{ tag: 'FOOD_WESTERN', kind: 'food', score: 0.75 }],
  },
  {
    id: 'place_cafe_food_dessert',
    match: { type: 'includes', value: ['카페', '커피', '디저트', '케이크', '빙수', '라떼', '아아'] },
    tags: [
      { tag: 'PLACE_CAFE', kind: 'place', score: 0.8 },
      { tag: 'FOOD_DESSERT', kind: 'food', score: 0.6 },
    ],
  },
  {
    id: 'drinks_bar',
    match: { type: 'includes', value: ['술', '소주', '맥주', '와인', '하이볼', '칵테일', '한잔', '바', '펍'] },
    tags: [
      { tag: 'INTENT_DRINKS', kind: 'activity', score: 0.8 },
      { tag: 'PLACE_BAR', kind: 'place', score: 0.7 },
    ],
  },

  // -------------------------
  // Places (장소)
  // -------------------------
  {
    id: 'place_park',
    match: { type: 'includes', value: ['공원', '산책로', '파크'] },
    tags: [{ tag: 'PLACE_PARK', kind: 'place', score: 0.8 }],
  },
  {
    id: 'place_river',
    match: { type: 'includes', value: ['강변', '한강'] },
    tags: [{ tag: 'PLACE_RIVER', kind: 'place', score: 0.75 }],
  },
  {
    id: 'place_beach',
    match: { type: 'includes', value: ['바다', '해변'] },
    tags: [{ tag: 'PLACE_BEACH', kind: 'place', score: 0.75 }],
  },
  {
    id: 'place_mountain',
    match: { type: 'includes', value: ['산', '등산'] },
    tags: [{ tag: 'PLACE_MOUNTAIN', kind: 'place', score: 0.7 }],
  },
  {
    id: 'place_museum_exhibition',
    match: { type: 'includes', value: ['전시', '전시회', '미술관', '박물관'] },
    tags: [
      { tag: 'PLACE_MUSEUM', kind: 'place', score: 0.75 },
      { tag: 'ACTIVITY_EXHIBITION', kind: 'activity', score: 0.65 },
    ],
  },
  {
    id: 'place_cinema',
    match: { type: 'includes', value: ['영화', '극장'] },
    tags: [{ tag: 'PLACE_CINEMA', kind: 'place', score: 0.75 }],
  },
  {
    id: 'place_shopping',
    match: { type: 'includes', value: ['쇼핑', '백화점', '아울렛', '몰'] },
    tags: [{ tag: 'PLACE_SHOPPING', kind: 'place', score: 0.75 }],
  },

  // -------------------------
  // Activities (활동)
  // -------------------------
  {
    id: 'activity_gym',
    match: { type: 'includes', value: ['운동', '헬스', '피트니스', 'pt'] },
    tags: [{ tag: 'ACTIVITY_GYM', kind: 'activity', score: 0.8 }],
  },
  {
    id: 'activity_running',
    match: { type: 'includes', value: ['러닝', '조깅', '달리기'] },
    tags: [{ tag: 'ACTIVITY_RUNNING', kind: 'activity', score: 0.8 }],
  },
  {
    id: 'activity_cycling',
    match: { type: 'includes', value: ['자전거', '라이딩'] },
    tags: [{ tag: 'ACTIVITY_CYCLING', kind: 'activity', score: 0.75 }],
  },
  {
    id: 'activity_swimming',
    match: { type: 'includes', value: ['수영', '수영장'] },
    tags: [{ tag: 'ACTIVITY_SWIMMING', kind: 'activity', score: 0.75 }],
  },
  {
    id: 'activity_karaoke',
    match: { type: 'includes', value: ['노래방'] },
    tags: [{ tag: 'ACTIVITY_KARAOKE', kind: 'activity', score: 0.75 }],
  },
  {
    id: 'activity_bowling',
    match: { type: 'includes', value: ['볼링'] },
    tags: [{ tag: 'ACTIVITY_BOWLING', kind: 'activity', score: 0.75 }],
  },
  {
    id: 'activity_billiards',
    match: { type: 'includes', value: ['당구', '포켓볼'] },
    tags: [{ tag: 'ACTIVITY_BILLIARDS', kind: 'activity', score: 0.75 }],
  },
  {
    id: 'activity_study',
    match: { type: 'includes', value: ['스터디', '공부', '독서'] },
    tags: [
      { tag: 'ACTIVITY_STUDY', kind: 'activity', score: 0.8 },
      { tag: 'VIBE_QUIET', kind: 'other', score: 0.6 },
    ],
  },
  {
    id: 'activity_walk',
    match: { type: 'includes', value: ['산책', '걷기'] },
    tags: [{ tag: 'ACTIVITY_WALK', kind: 'activity', score: 0.75 }],
  },

  // -------------------------
  // Social intent (소셜/만남 방식)
  // -------------------------
  {
    id: 'intent_solo',
    match: { type: 'regex', value: [/(혼밥)/, /(혼자)/, /(1\s*인)/] },
    tags: [{ tag: 'INTENT_SOLO', kind: 'activity', score: 0.8 }],
  },
  {
    id: 'intent_meetup',
    match: { type: 'includes', value: ['같이', '동행', '모임', '번개'] },
    tags: [{ tag: 'INTENT_MEETUP', kind: 'activity', score: 0.75 }],
  },

  // -------------------------
  // Time intent (시간)
  // -------------------------
  {
    id: 'time_now',
    match: { type: 'includes', value: ['지금', '바로', '당장'] },
    tags: [{ tag: 'TIME_NOW', kind: 'time', score: 0.8 }],
  },
  {
    id: 'time_today',
    match: { type: 'regex', value: [/(오늘)/, /(오늘\s*밤)/, /(저녁)/] },
    tags: [{ tag: 'TIME_TODAY', kind: 'time', score: 0.7 }],
  },
  {
    id: 'time_weekend',
    match: { type: 'includes', value: ['주말', '이번 주말', '이번주말'] },
    tags: [{ tag: 'TIME_WEEKEND', kind: 'time', score: 0.75 }],
  },
];
