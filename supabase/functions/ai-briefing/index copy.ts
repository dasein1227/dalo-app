// supabase/functions/ai-briefing/index.ts

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type BusinessRow = {
  id: string;
  name: string | null;
  address: string | null;
  one_line_intro: string | null;
  description: string | null;
  category_major?: string | null;
  category_minor?: string | null;
  minsaeng_coupon?: boolean | null;
  local_giftcard?: boolean | null;
  facilities?: string | null;
  seating_info?: string | null;
  payment_methods?: string | null;
  open_time?: string | null;
  close_time?: string | null;
  last_order_time?: string | null;
};

type BusinessMenu = {
  id: string;
  name: string | null;
  description?: string | null;
  category?: string | null;
};

type BusinessMenuItem = {
  id: string;
  menu_id: string;
  name: string | null;
  description?: string | null;
  price?: number | null;
  is_signature?: boolean | null;
  sort_order?: number | null;
};

type BusinessPhoto = {
  id: string;
  caption?: string | null;
};

type BusinessEvent = {
  id: string;
  title?: string | null;
  body?: string | null;
};

type BusinessNotice = {
  id: string;
  title?: string | null;
  body?: string | null;
};

type BusinessFeedPost = {
  id: string;
  caption: string | null;
  created_at: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY')!;
const DEEPSEEK_API_BASE =
  Deno.env.get('DEEPSEEK_API_BASE') ?? 'https://api.deepseek.com';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
}
if (!DEEPSEEK_API_KEY) {
  console.error('❌ DEEPSEEK_API_KEY가 없습니다.');
}

/**
 * Authorization 헤더에서 JWT의 payload를 파싱해서 user id(sub)를 얻는다.
 */
function getUserIdFromAuthHeader(req: Request): string | null {
  try {
    const auth = req.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;

    const token = auth.slice('Bearer '.length);
    const parts = token.split('.');
    if (parts.length < 2) return null;

    const payload = parts[1];

    // base64url -> base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);

    const json = atob(padded);
    const data = JSON.parse(json);
    const sub = data.sub ?? data.user_id ?? null;
    return typeof sub === 'string' ? sub : null;
  } catch (e) {
    console.error('❌ getUserIdFromAuthHeader error', e);
    return null;
  }
}

/**
 * i18n에서 쓰는 언어 코드(AppLang)를 DeepSeek에게 설명할 때 쓸 “언어 이름”으로 변환.
 */
function getLanguageNameForModel(langCode: string): string {
  switch (langCode) {
    case 'ko':
      return '한국어';
    case 'en':
      return '영어';
    case 'ja':
      return '일본어';
    case 'zh':
      return '중국어';
    case 'es':
      return '스페인어';
    case 'fr':
      return '프랑스어';
    case 'de':
      return '독일어';
    case 'pt':
      return '포르투갈어';
    case 'ru':
      return '러시아어';
    case 'hi':
      return '힌디어';
    case 'id':
      return '인도네시아어';
    case 'ar':
      return '아랍어';
    default:
      // 혹시 지원하지 않는 코드면 한국어로 고정
      return '한국어';
  }
}

/**
 * 언어 코드가 지원 목록 안에 있는지 검증. 아니면 ko로.
 */
function normalizeLangCode(langCode: string | null | undefined): string {
  const supported = [
    'ar',
    'de',
    'en',
    'es',
    'fr',
    'hi',
    'id',
    'ja',
    'ko',
    'pt',
    'ru',
    'zh',
  ];
  if (!langCode) return 'ko';
  const lc = String(langCode).toLowerCase();
  return supported.includes(lc) ? lc : 'ko';
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'POST만 지원합니다.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { businessId } = (await req.json()) as { businessId?: string };

    if (!businessId) {
      return new Response(
        JSON.stringify({ message: 'businessId가 필요합니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!DEEPSEEK_API_KEY) {
      return new Response(
        JSON.stringify({
          message:
            'DEEPSEEK_API_KEY가 설정되어 있지 않습니다. Supabase Functions 환경변수를 확인해 주세요.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: {
        headers: {
          // RLS를 위해 클라이언트에서 온 Authorization을 그대로 전달
          Authorization: req.headers.get('Authorization') ?? '',
        },
      },
    });

    // ==========================
    // 0) 호출한 유저의 언어 결정
    // ==========================
    const userId = getUserIdFromAuthHeader(req);
    let langCode = 'ko'; // 기본값

    if (userId) {
      const { data: prof, error: profError } = await supabase
        .from('profiles')
        .select('preferred_lang')
        .eq('id', userId)
        .maybeSingle();

      if (profError) {
        console.error('❌ profile fetch error (for lang)', profError);
      }

      langCode = normalizeLangCode((prof as any)?.preferred_lang ?? 'ko');
    } else {
      // userId가 없는 경우에도 안전하게 ko로 고정
      langCode = 'ko';
    }

    const langNameForModel = getLanguageNameForModel(langCode);

    // 1) 비즈니스 기본 정보 조회
    const { data: biz, error: bizError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .maybeSingle();

    if (bizError) {
      console.error('❌ business fetch error', bizError);
      return new Response(
        JSON.stringify({ message: '가게 정보를 불러오지 못했습니다.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!biz) {
      return new Response(
        JSON.stringify({ message: '해당 가게를 찾을 수 없습니다.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const b = biz as BusinessRow & Record<string, any>;

    const name = b.name ?? '이 가게';
    const addr = b.address ?? '';
    const major = b.category_major ?? (b as any).category ?? '';
    const minor = b.category_minor ?? '';
    const category = major && minor ? `${major} · ${minor}` : major || '';

    const minsaeng = b.minsaeng_coupon;
    const localGift = b.local_giftcard;

    // 2) 메뉴 / 사진 / 이벤트 / 공지 / 방문자 피드 조회
    const [
      { data: menus, error: menusError },
      { data: items, error: itemsError },
      { data: photos, error: photosError },
      { data: events, error: eventsError },
      { data: notices, error: noticesError },
      { data: feeds, error: feedsError },
    ] = await Promise.all([
      supabase
        .from('business_menus')
        .select('id, name, description, category')
        .eq('business_id', businessId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('business_menu_items')
        .select('menu_id, name, description, price, is_signature, sort_order')
        .eq('business_id', businessId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('business_photos')
        .select('id, caption')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('business_events')
        .select('id, title, body')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('business_notices')
        .select('id, title, body')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('posts')
        .select('id, caption, created_at')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (menusError) console.error('❌ menus fetch error', menusError);
    if (itemsError) console.error('❌ menu_items fetch error', itemsError);
    if (photosError) console.error('❌ photos fetch error', photosError);
    if (eventsError) console.error('❌ events fetch error', eventsError);
    if (noticesError) console.error('❌ notices fetch error', noticesError);
    if (feedsError) console.error('❌ feeds fetch error', feedsError);

    const menuList = (menus ?? []) as BusinessMenu[];
    const itemList = (items ?? []) as BusinessMenuItem[];
    const photoList = (photos ?? []) as BusinessPhoto[];
    const eventList = (events ?? []) as BusinessEvent[];
    const noticeList = (notices ?? []) as BusinessNotice[];
    const feedList = (feeds ?? []) as BusinessFeedPost[];

    // 시그니처 메뉴 / 대표 메뉴 후보
    const signatureItems = itemList
      .filter((i) => !!i.is_signature)
      .slice(0, 8)
      .map((i) => ({
        name: i.name,
        description: i.description,
        price: i.price,
      }));

    // 시그니처 외, 일반 메뉴 샘플 (최대 15개)
    const regularItems = itemList
      .filter((i) => !i.is_signature)
      .slice(0, 15)
      .map((i) => ({
        name: i.name,
        description: i.description,
        price: i.price,
      }));

    // 방문자 피드 요약용
    const recentFeeds = feedList.map((f) => ({
      caption: f.caption,
      created_at: f.created_at,
    }));

    const infoForPrompt = {
      name,
      address: addr,
      category,
      one_line_intro: b.one_line_intro,
      description: b.description,
      minsaeng_coupon: minsaeng,
      local_giftcard: localGift,
      facilities: b.facilities,
      seating_info: b.seating_info,
      payment_methods: b.payment_methods,
      open_time: b.open_time,
      close_time: b.close_time,
      last_order_time: b.last_order_time,

      menus: menuList.map((m) => ({
        name: m.name,
        description: m.description,
        category: m.category,
      })),

      signature_menu_items: signatureItems,
      menu_items_sample: regularItems,

      events: eventList.map((e) => ({
        title: e.title,
        body: e.body,
      })),
      notices: noticeList.map((n) => ({
        title: n.title,
        body: n.body,
      })),
      photos: photoList.map((p) => ({
        caption: p.caption,
      })),

      // ✅ 최근 방문자 피드(손님 후기) 텍스트
      recent_feeds: recentFeeds,
    };

    const userPrompt =
      `출력 언어: ${langCode} (${langNameForModel})\n` +
      `아래는 동네 가게의 상세 정보와 최근 방문자 피드(손님 후기)입니다. ` +
      `이 JSON에 들어 있는 가게 기본 정보, 메뉴/시그니처 메뉴, 편의시설, 이벤트/공지, ` +
      `그리고 recent_feeds에 들어 있는 손님 후기 캡션을 참고해서 ` +
      `네이버 플레이스 스타일의 짧은 소개문(3~5문장)을 작성해 주세요.\n\n` +
      `소개문은 반드시 "${langNameForModel}"로만 작성해 주세요.\n\n` +
      `요구사항:\n` +
      `1) 1문장: 가게의 위치/카테고리와 한 줄 특징 요약\n` +
      `2) 1~2문장: 시그니처 메뉴나 인기 메뉴, 메뉴판 특징을 중심으로 설명\n` +
      `3) 1문장: 분위기, 좌석/공간, 편의시설(주차/결제/쿠폰 등) 중 중요한 포인트를 한 번 더 강조\n` +
      `4) 이벤트나 공지가 있으면 자연스럽게 한 문장 안에 녹여서 언급 (예: 시즌 한정 메뉴, 할인 이벤트 등)\n` +
      `5) recent_feeds(손님 후기)의 분위기와 키워드를 참고해서, 실제 방문객들이 느낄 법한 인상을 자연스럽게 녹여주세요.\n` +
      `6) 너무 광고 문구 같지 않게, 친구에게 추천하는 톤으로 담백하게 작성\n` +
      `7) bullet이나 리스트 없이, 하나의 자연스러운 문단으로만 작성\n\n` +
      `가게 정보(JSON):\n` +
      `${JSON.stringify(infoForPrompt, null, 2)}`;

    // 3) DeepSeek API 호출
    const dsRes = await fetch(`${DEEPSEEK_API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              `당신은 여러 언어로 상점 소개 카피를 작성하는 어시스턴트입니다. ` +
              `사용자가 지정한 출력 언어(${langNameForModel}) 외의 언어는 절대 사용하지 마세요.`,
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 512,
      }),
    });

    if (!dsRes.ok) {
      const text = await dsRes.text();
      console.error('❌ DeepSeek API error', dsRes.status, text);
      return new Response(
        JSON.stringify({
          message: 'AI 모델 호출에 실패했습니다. (DeepSeek 응답이 2xx가 아님)',
          detail: text,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const dsJson: any = await dsRes.json();
    const briefing: string =
      dsJson?.choices?.[0]?.message?.content?.trim() ?? '';

    if (!briefing) {
      return new Response(
        JSON.stringify({
          message: 'AI가 유효한 브리핑을 생성하지 못했습니다.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const nowIso = new Date().toISOString();

    // 4) DB에 저장
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        ai_briefing: briefing,
        ai_briefing_updated_at: nowIso,
      })
      .eq('id', businessId);

    if (updateError) {
      console.error('❌ update error', updateError);
      // 그래도 브리핑은 응답으로 내려준다
    }

    // 5) 클라이언트로 성공 응답
    return new Response(
      JSON.stringify({
        briefing,
        updated_at: nowIso,
        lang: langCode,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('❌ ai-briefing fatal error', err);
    return new Response(
      JSON.stringify({
        message: 'AI 브리핑 생성 중 서버 내부 오류가 발생했습니다.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
