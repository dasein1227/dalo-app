// supabase/functions/ai-briefing/index.ts
// Owner-triggered (low frequency) briefing renderer.
// - Uses business facts (businesses/menus/items/photos/events/posts)
// - Optionally uses existing businesses.profile_json (no recompute)
// - Writes businesses.ai_briefing + ai_briefing_updated_at
//
// Backward compatible input: { businessId } or { business_id }
// Output: { briefing, updated_at, lang }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type ReqBody = {
  businessId?: string;
  business_id?: string;
  lang?: "ko" | "en";
  dry_run?: boolean;
};

type BusinessRow = {
  id: string;
  name: string | null;
  address: string | null;
  one_line_intro: string | null;
  description: string | null;
  category_major?: string | null;
  category_minor?: string | null;
  facilities?: string | null;
  logo_image_url?: string | null;
  main_image_url?: string | null;
  hero_image_url?: string | null;
  profile_json?: any;
};

type BusinessMenu = { id: string; title?: string | null };
type BusinessMenuItem = {
  id: string;
  menu_id: string;
  name: string | null;
  description?: string | null;
  price?: number | null;
  is_signature?: boolean | null;
  sort_order?: number | null;
};
type BusinessPhoto = { id: string; caption?: string | null };
type BusinessEvent = { id: string; title?: string | null; body?: string | null };
type BusinessFeedPost = { id: string; caption: string | null; created_at: string };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const nowIso = () => new Date().toISOString();

async function groqChat(apiKey: string, model: string, messages: Array<{ role: "system" | "user"; content: string }>, temperature = 0.3, maxTokens = 900) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Groq non-OK: ${resp.status} ${t}`);
  }
  return await resp.json();
}

async function deepseekChat(apiKey: string, apiBase: string, messages: Array<{ role: "system" | "user"; content: string }>, temperature = 0.3, maxTokens = 900) {
  const resp = await fetch(`${apiBase.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "deepseek-chat", messages, temperature, max_tokens: maxTokens }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`DeepSeek non-OK: ${resp.status} ${t}`);
  }
  return await resp.json();
}

function buildPrompt(params: {
  biz: BusinessRow | null;
  menus: BusinessMenu[];
  menuItems: BusinessMenuItem[];
  photos: BusinessPhoto[];
  events: BusinessEvent[];
  feeds: BusinessFeedPost[];
  lang: "ko" | "en";
}) {
  const { biz, menus, menuItems, photos, events, feeds, lang } = params;

  const profile = biz?.profile_json ?? null;

  const facts = {
    name: biz?.name ?? null,
    address: biz?.address ?? null,
    one_line_intro: biz?.one_line_intro ?? null,
    description: biz?.description ?? null,
    category_major: (biz as any)?.category_major ?? null,
    category_minor: (biz as any)?.category_minor ?? null,
    facilities: (biz as any)?.facilities ?? null,
    images: {
      logo: (biz as any)?.logo_image_url ?? null,
      main: (biz as any)?.main_image_url ?? null,
      hero: (biz as any)?.hero_image_url ?? null,
    },
  };

  const menusSnippet = menus.slice(0, 6).map((m) => ({ id: m.id, title: m.title ?? null }));
  const itemsSnippet = menuItems
    .filter((x) => x.name)
    .slice(0, 24)
    .map((x) => ({ name: x.name, price: x.price ?? null, is_signature: x.is_signature ?? null }));

  const eventsSnippet = events.slice(0, 5).map((e) => ({ title: e.title ?? null, body: (e.body ?? "").slice(0, 200) }));
  const photosSnippet = photos.slice(0, 10).map((p) => ({ caption: (p.caption ?? "").slice(0, 90) }));
  const feedsSnippet = feeds.slice(0, 10).map((f) => ({ caption: (f.caption ?? "").slice(0, 140), created_at: f.created_at }));

  const perceptionSnippet =
    profile
      ? JSON.stringify(
          {
            version: profile?.version ?? null,
            window_days: profile?.window_days ?? null,
            category_top3: profile?.category_top3 ?? null,
            atmosphere_top: profile?.groups?.atmosphere?.top?.slice?.(0, 5) ?? null,
            purpose_top: profile?.groups?.purpose?.top?.slice?.(0, 5) ?? null,
            confidence: {
              atmosphere: profile?.groups?.atmosphere?.confidence ?? null,
              purpose: profile?.groups?.purpose?.confidence ?? null,
            },
            sources: profile?.sources ?? null,
          },
          null,
          2,
        )
      : "null";

  const system =
    lang === "ko"
      ? `너는 가게 페이지의 "AI 브리핑"을 작성한다. 과장하지 말고, 제공된 데이터에 근거해 4~7문장으로 간결하게 작성하라.`
      : `You write a concise venue briefing. Do not exaggerate; use only provided data. 4-7 sentences.`;

  const user =
    lang === "ko"
      ? `
[가게 facts]
${JSON.stringify(facts, null, 2)}

[메뉴(카테고리)]
${JSON.stringify(menusSnippet, null, 2)}

[메뉴 아이템]
${JSON.stringify(itemsSnippet, null, 2)}

[사진 캡션(일부)]
${JSON.stringify(photosSnippet, null, 2)}

[이벤트/공지(일부)]
${JSON.stringify(eventsSnippet, null, 2)}

[최근 피드(일부)]
${JSON.stringify(feedsSnippet, null, 2)}

[최근 태그/포스트 기반 인식(perception) - 있을 때만 참고]
${perceptionSnippet}

요구사항:
- 4~7문장, 한국어
- perception confidence가 낮으면 단정하지 말고 "최근 언급" 수준으로 표현
- 메뉴/시설은 존재하는 데이터 위주로
- 마지막 문장은 방문 목적 추천 1개만
`
      : `
[Venue facts]
${JSON.stringify(facts, null, 2)}

[Menus]
${JSON.stringify(menusSnippet, null, 2)}

[Menu items]
${JSON.stringify(itemsSnippet, null, 2)}

[Photo captions]
${JSON.stringify(photosSnippet, null, 2)}

[Events]
${JSON.stringify(eventsSnippet, null, 2)}

[Recent feed]
${JSON.stringify(feedsSnippet, null, 2)}

[Perception profile (optional)]
${perceptionSnippet}

Requirements:
- 4-7 sentences, English
- If confidence low, avoid definitive claims
- Mention menu/amenities only if present
- End with exactly one recommended use-case
`;

  return { system, user };
}

serve(async (req) => {
  if (req.method !== "POST") return json(405, { message: "POST만 지원합니다." });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(500, { message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });

    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
    const DEEPSEEK_API_BASE = Deno.env.get("DEEPSEEK_API_BASE") ?? "https://api.deepseek.com/v1";
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
    const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.1-70b-versatile";

    const body = (await req.json().catch(() => null)) as ReqBody | null;
    const businessId = body?.business_id ?? body?.businessId ?? null;
    if (!businessId) return json(400, { message: "business_id 또는 businessId가 필요합니다." });

    const lang = (body?.lang ?? "ko") as "ko" | "en";
    const dryRun = !!body?.dry_run;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const now = nowIso();

    const bizRes = await admin
      .from("businesses")
      .select("id,name,address,one_line_intro,description,category_major,category_minor,facilities,logo_image_url,main_image_url,hero_image_url,profile_json")
      .eq("id", businessId)
      .maybeSingle();

    if (bizRes.error || !bizRes.data) return json(404, { message: "BUSINESS_NOT_FOUND", detail: bizRes.error?.message ?? null });
    const biz = bizRes.data as any as BusinessRow;

    const menusRes = await admin
      .from("business_menus")
      .select("id,title")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: true });
    const menus = (menusRes.data ?? []) as BusinessMenu[];

    const itemsRes = menus.length
      ? await admin
          .from("business_menu_items")
          .select("id,menu_id,name,description,price,is_signature,sort_order")
          .in("menu_id", menus.map((m) => m.id).slice(0, 50))
      : { data: [], error: null as any };
    const menuItems = (itemsRes.data ?? []) as BusinessMenuItem[];

    const photosRes = await admin
      .from("business_photos")
      .select("id,caption")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(30);
    const photos = (photosRes.data ?? []) as BusinessPhoto[];

    const eventsRes = await admin
      .from("business_events")
      .select("id,title,body")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(12);
    const events = (eventsRes.data ?? []) as BusinessEvent[];

    const feedsRes = await admin
      .from("posts")
      .select("id,caption,created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(12);
    const feeds = (feedsRes.data ?? []) as BusinessFeedPost[];

    const { system, user } = buildPrompt({ biz, menus, menuItems, photos, events, feeds, lang });

    let briefing = "";
    try {
      if (DEEPSEEK_API_KEY) {
        const ds = await deepseekChat(DEEPSEEK_API_KEY, DEEPSEEK_API_BASE, [
          { role: "system", content: system },
          { role: "user", content: user },
        ]);
        briefing = ds?.choices?.[0]?.message?.content?.trim?.() ?? "";
      } else if (GROQ_API_KEY) {
        const gr = await groqChat(GROQ_API_KEY, GROQ_MODEL, [
          { role: "system", content: system },
          { role: "user", content: user },
        ]);
        briefing = gr?.choices?.[0]?.message?.content?.trim?.() ?? "";
      } else {
        briefing = "";
      }
    } catch (e) {
      console.error("briefing generation failed", e);
      briefing = "";
    }

    if (!dryRun && briefing) {
      const upd = await admin
        .from("businesses")
        .update({ ai_briefing: briefing, ai_briefing_updated_at: now })
        .eq("id", businessId);
      if (upd.error) console.error("ai_briefing update error", upd.error);
    }

    return json(200, { briefing, updated_at: now, lang, saved: !dryRun });
  } catch (err: any) {
    console.error("ai-briefing fatal error", err);
    return json(500, { message: "AI 브리핑 생성 중 서버 내부 오류", detail: err?.message ?? String(err) });
  }
});
