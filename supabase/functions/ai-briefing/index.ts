// supabase/functions/ai-briefing/index.ts
// Owner-triggered (low frequency) briefing renderer.
// - Uses business facts (businesses/menus/items/photos/events/posts)
// - Optionally uses existing businesses.profile_json (no recompute)
// - Writes businesses.ai_briefing + ai_briefing_updated_at
// - (NEW) Writes businesses.ai_copies (jsonb): pre-generated copy bank for banners/cards
//
// Backward compatible input: { businessId } or { business_id }
// Output: { briefing, updated_at, lang, saved, ai_copies_saved?, ai_copies_count? }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type AiLanguageCode =
  | "ko"
  | "en"
  | "ja"
  | "zh"
  | "es"
  | "pt"
  | "fr"
  | "de"
  | "id"
  | "hi"
  | "ru"
  | "ar"
  | "vi"
  | "tr"
  | "th"
  | "it";

type ReqBody = {
  businessId?: string;
  business_id?: string;
  lang?: string;
  target_lang?: string;
  target_language?: string;
  force_lang?: boolean;
  dry_run?: boolean;
  with_copies?: boolean;
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
  is_adult?: boolean | null;
  has_active_event?: boolean | null;
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

type AICopy = {
  id: string;
  headline: string;
  conditions: {
    weather?: Array<"clear" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder" | "unknown">;
    time?: Array<"06-11" | "11-17" | "17-22" | "22-02">;
    temp_min?: number;
    temp_max?: number;
    category_major?: string[];
    category_minor?: string[];
    adult?: boolean;
    has_event?: boolean;
    vibe?: string[];
  };
};

type AICopiesPayload = {
  version: 1;
  generated_at: string;
  lang: AiLanguageCode;
  copies: AICopy[];
  notes?: {
    source?: "llm" | "fallback";
  };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const nowIso = () => new Date().toISOString();

const SUPPORTED_AI_LANGUAGES: AiLanguageCode[] = [
  "ko",
  "en",
  "ja",
  "zh",
  "es",
  "pt",
  "fr",
  "de",
  "id",
  "hi",
  "ru",
  "ar",
  "vi",
  "tr",
  "th",
  "it",
];

const SUPPORTED_AI_LANGUAGE_SET = new Set<string>(SUPPORTED_AI_LANGUAGES);

const AI_LANGUAGE_NAMES: Record<AiLanguageCode, string> = {
  ko: "Korean",
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  id: "Indonesian",
  hi: "Hindi",
  ru: "Russian",
  ar: "Arabic",
  vi: "Vietnamese",
  tr: "Turkish",
  th: "Thai",
  it: "Italian",
};

function normalizeAiLanguage(value?: string | null): AiLanguageCode {
  const raw = String(value || "ko").trim().toLowerCase();
  const base = raw.split("-")[0] || "ko";
  return SUPPORTED_AI_LANGUAGE_SET.has(base) ? (base as AiLanguageCode) : "ko";
}

function countHangul(text: string): number {
  return (text.match(/[가-힣]/g) ?? []).length;
}

function hasLikelyKoreanOutput(text: string, lang: AiLanguageCode): boolean {
  if (lang === "ko") return false;
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;

  const hangul = countHangul(trimmed);
  if (hangul <= 8) return false;

  const visibleLength = trimmed.replace(/\s+/g, "").length || 1;
  return hangul / visibleLength >= 0.06;
}

async function groqChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature = 0.4, // Increased slightly for creativity within constraints
  maxTokens = 1400,
) {
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

async function deepseekChat(
  apiKey: string,
  apiBase: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature = 0.4,
  maxTokens = 1400,
) {
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

function extractFirstJsonObject(text: string): any | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* ignore */
    }
  }
  const start = trimmed.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) {
      const candidate = trimmed.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeWeatherKey(x: any) {
  const v = String(x ?? "").toLowerCase();
  const allowed = new Set(["clear", "cloudy", "fog", "drizzle", "rain", "snow", "thunder", "unknown"]);
  if (allowed.has(v)) return v as any;
  return "unknown" as const;
}

function normalizeTimeBand(x: any) {
  const v = String(x ?? "");
  const allowed = new Set(["06-11", "11-17", "17-22", "22-02"]);
  if (allowed.has(v)) return v as any;
  return null;
}

function sanitizeCopies(input: any, lang: AiLanguageCode, biz: BusinessRow): AICopiesPayload | null {
  if (!input || typeof input !== "object") return null;

  const copiesRaw = input?.copies;
  if (!Array.isArray(copiesRaw)) return null;

  const maxN = 24;
  const copies: AICopy[] = [];

  for (let i = 0; i < copiesRaw.length && copies.length < maxN; i++) {
    const c = copiesRaw[i];
    const headline = typeof c?.headline === "string" ? c.headline.trim() : "";
    if (!headline) continue;

    const id = typeof c?.id === "string" && c.id.trim() ? c.id.trim() : `c_${i + 1}`;
    const cond = c?.conditions ?? {};
    const out: AICopy = { id, headline, conditions: {} };

    if (Array.isArray(cond.weather)) {
      out.conditions.weather = cond.weather.map(normalizeWeatherKey);
    }
    if (Array.isArray(cond.time)) {
      const bands = cond.time.map(normalizeTimeBand).filter(Boolean);
      if (bands.length) out.conditions.time = bands as any;
    }
    if (typeof cond.temp_min === "number" && Number.isFinite(cond.temp_min)) {
      out.conditions.temp_min = clamp(cond.temp_min, -20, 45);
    }
    if (typeof cond.temp_max === "number" && Number.isFinite(cond.temp_max)) {
      out.conditions.temp_max = clamp(cond.temp_max, -20, 45);
    }
    if (Array.isArray(cond.category_major)) {
      out.conditions.category_major = cond.category_major.map((s: any) => String(s ?? "").trim()).filter(Boolean).slice(0, 6);
    }
    if (Array.isArray(cond.category_minor)) {
      out.conditions.category_minor = cond.category_minor.map((s: any) => String(s ?? "").trim()).filter(Boolean).slice(0, 6);
    }
    if (typeof cond.adult === "boolean") out.conditions.adult = cond.adult;
    if (typeof cond.has_event === "boolean") out.conditions.has_event = cond.has_event;

    if (Array.isArray(cond.vibe)) {
      out.conditions.vibe = cond.vibe.map((s: any) => String(s ?? "").trim()).filter(Boolean).slice(0, 8);
    }

    if (biz.is_adult === true) {
      if (out.conditions.adult === false) delete out.conditions.adult;
    } else if (biz.is_adult === false) {
      if (out.conditions.adult === true) delete out.conditions.adult;
    }

    if (biz.has_active_event === false && out.conditions.has_event === true) {
      delete out.conditions.has_event;
    }

    copies.push(out);
  }

  if (!copies.length) return null;

  return {
    version: 1,
    generated_at: nowIso(),
    lang,
    copies,
    notes: { source: "llm" },
  };
}

function buildPrompt(params: {
  biz: BusinessRow | null;
  menus: BusinessMenu[];
  menuItems: BusinessMenuItem[];
  photos: BusinessPhoto[];
  events: BusinessEvent[];
  feeds: BusinessFeedPost[];
  lang: AiLanguageCode;
  withCopies: boolean;
}) {
  const { biz, menus, menuItems, photos, events, feeds, lang, withCopies } = params;

  const profile = biz?.profile_json ?? null;
  const facts = {
    name: biz?.name ?? null,
    address: biz?.address ?? null,
    one_line_intro: biz?.one_line_intro ?? null,
    description: biz?.description ?? null,
    category_major: (biz as any)?.category_major ?? null,
    category_minor: (biz as any)?.category_minor ?? null,
    facilities: (biz as any)?.facilities ?? null,
    flags: {
      is_adult: (biz as any)?.is_adult ?? null,
      has_active_event: (biz as any)?.has_active_event ?? null,
    },
    images: {
      logo: (biz as any)?.logo_image_url ?? null,
      main: (biz as any)?.main_image_url ?? null,
      hero: (biz as any)?.hero_image_url ?? null,
    },
  };

  const menusSnippet = menus.slice(0, 6).map((m) => ({ id: m.id, title: m.title ?? null }));
  const itemsSnippet = menuItems.filter((x) => x.name).slice(0, 24).map((x) => ({ name: x.name, price: x.price ?? null }));
  const eventsSnippet = events.slice(0, 5).map((e) => ({ title: e.title ?? null, body: (e.body ?? "").slice(0, 200) }));
  const photosSnippet = photos.slice(0, 10).map((p) => ({ caption: (p.caption ?? "").slice(0, 90) }));
  const feedsSnippet = feeds.slice(0, 10).map((f) => ({ caption: (f.caption ?? "").slice(0, 140), created_at: f.created_at }));

  const perceptionSnippet = profile
    ? JSON.stringify(
        {
          category_top3: profile?.category_top3 ?? null,
          signals: profile?.signals?.slice?.(0, 12) ?? null,
          summary: profile?.summary ?? null,
        },
        null,
        2,
      )
    : "null";

  // --- PROMPT ENGINEERING START ---

  const targetLanguageName = AI_LANGUAGE_NAMES[lang] ?? "Korean";
  const compactHeadlineLang = new Set<AiLanguageCode>(["ko", "ja", "zh", "th"]);
  const headlineLengthRule = compactHeadlineLang.has(lang)
    ? "10-28 characters"
    : "30-50 characters";

  const toneInstructionKo = `
[Role]
너는 1억명이 사용하는 프리미엄 라이프스타일 앱의 "수석 UX 카피라이터"다.
너의 문구는 사용자에게 영감을 주고, 방문하고 싶게 만들며, 결코 강압적이거나 촌스럽지 않다.

[Tone & Manner - Korean]
1. **정중하고 감성적인 어투**: "~하세요", "오세요" 같은 명령조를 절대 쓰지 마라.
2. **세련된 권유**: "~어때요?", "~가 필요한 순간", 혹은 명사형 종결("~의 맛", "~있는 곳")을 사용하여 여운을 남겨라.
3. **과장 금지**: "최고의", "무조건" 같은 표현은 삼가라. 있는 그대로의 가치를 빛내라.
4. **상황 묘사**: 단순히 "비 오면 오세요"가 아니라 "빗소리와 함께 깊어지는 시간"처럼 분위기를 팔아라.
5. **어른스러운 문체**: 가벼운 유행어보다는 오래 읽히는 문장을 써라.

[Bad Examples]
- "비오는데 막걸리 한잔 하러 오세요!" (강요, 촌스러움)
- "최고의 맛집! 지금 바로 예약하세요." (광고성 짙음)

[Good Examples]
- "비 오는 날, 빗소리와 가장 잘 어울리는 한 잔"
- "퇴근길, 당신을 위로할 따뜻한 식탁"
- "오직 이 계절에만 만날 수 있는 맛"
`;

  const toneInstructionGlobal = `
[Role]
You are a Lead UX Copywriter for a premium lifestyle app with 100M users.
Your copy is inspiring, inviting, and never coercive.

[Target Language]
Write every user-facing value in ${targetLanguageName}.
Translate Korean source facts into ${targetLanguageName}.
Do not answer in Korean unless the target language is Korean.
Do not mix languages unless a proper noun, brand name, menu name, or address requires it.

[Tone & Manner]
1. **Polite & Evocative**: Do not use hard imperatives like "Come here" or "Buy now".
2. **Sophisticated**: Focus on mood, texture, and experience.
3. **No Hype**: Avoid exaggerated claims like "best ever" or "must-visit".
4. **Contextual**: Connect the venue to a moment, weather, time of day, or occasion.
5. **Concise**: Write premium, magazine-style copy.
`;

  const taskBriefing =
    lang === "ko"
      ? `가게 데이터를 바탕으로 "AI 브리핑(4~7문장)"과 배너용 "카피 뱅크(8~12개)"를 JSON 포맷으로 작성하라.`
      : `Based on the venue data, write an "AI Briefing (4-7 sentences)" and a "Copy Bank (8-12 items)" in ${targetLanguageName}.`;

  const jsonSchema = withCopies
    ? `{
  "briefing": "string",
  "copies": [
    {
      "id": "string",
      "headline": "string",
      "conditions": {
        "weather": ["clear"|"cloudy"|"fog"|"drizzle"|"rain"|"snow"|"thunder"|"unknown"]?,
        "time": ["06-11"|"11-17"|"17-22"|"22-02"]?,
        "temp_min": number?,
        "temp_max": number?,
        "category_major": ["string"]?,
        "adult": boolean?,
        "has_event": boolean?
      }
    }
  ]
}`
    : `{ "briefing": "string" }`;

  const system = lang === "ko" ? toneInstructionKo : toneInstructionGlobal;

  const user = `
${taskBriefing}

[Output Rules]
1. **JSON ONLY**. No markdown, no explanations.
2. **Language**: All user-facing values MUST be written in ${targetLanguageName}. Translate source data into ${targetLanguageName}. Korean is allowed only for proper nouns, business names, menu names, addresses, or brand names.
3. **Briefing**: Factual summary of the venue.
4. **Copies**:
   - Create 8-12 variations tailored to specific contexts (Rain, Late Night, Cold, Event, etc.).
   - Use the fields in [Venue Facts] and [Menu] to make it specific.
   - If 'is_adult' is true, allow alcohol-related contexts.
   - If 'has_active_event' is true, create a copy for the event.
   - **Headline Length**: ${headlineLengthRule}.

[Venue Facts]
${JSON.stringify(facts, null, 2)}

[Menus]
${JSON.stringify(menusSnippet, null, 2)}

[Items]
${JSON.stringify(itemsSnippet, null, 2)}

[Photos/Feed/Events]
${JSON.stringify({ photos: photosSnippet, events: eventsSnippet, feeds: feedsSnippet }, null, 2)}

[Perception]
${perceptionSnippet}

Output JSON format:
${jsonSchema}
`;

  return { system, user };
}

function buildFallbackCopies(lang: AiLanguageCode, biz: BusinessRow): AICopiesPayload {
  const major = biz.category_major ?? "";
  const isAdult = biz.is_adult === true;
  const hasEvent = biz.has_active_event === true;

  // Fallback copies rewritten to be more "polite" and "emotional"
  const koBase: AICopy[] = [
    {
      id: "nearby",
      headline: "잠시 쉬어가고 싶은 순간",
      conditions: { time: ["11-17"] },
    },
    {
      id: "evening",
      headline: "오늘 하루의 끝을 완벽하게",
      conditions: { time: ["17-22"] },
    },
    {
      id: "late",
      headline: "깊어가는 밤, 이야기가 있는 곳",
      conditions: { time: ["22-02"] },
    },
    {
      id: "rain",
      headline: "비 오는 날, 더 운치 있는 공간",
      conditions: { weather: ["rain", "drizzle"] },
    },
    {
      id: "cold",
      headline: "차가운 공기를 녹이는 따스함",
      conditions: { temp_max: 5, time: ["17-22", "22-02"] },
    },
    {
      id: "hot",
      headline: "무더위를 잊게 할 시원한 휴식",
      conditions: { temp_min: 28, time: ["11-17", "17-22"] },
    },
  ];

  const enBase: AICopy[] = [
    {
      id: "nearby",
      headline: "A perfect pause in your day.",
      conditions: { time: ["11-17"] },
    },
    {
      id: "evening",
      headline: "Where your evening deepens.",
      conditions: { time: ["17-22"] },
    },
    {
      id: "late",
      headline: "For the stories that last all night.",
      conditions: { time: ["22-02"] },
    },
    {
      id: "rain",
      headline: "A cozy shelter from the rain.",
      conditions: { weather: ["rain", "drizzle"] },
    },
    {
      id: "cold",
      headline: "Warmth you need right now.",
      conditions: { temp_max: 5 },
    },
  ];

  const base = lang === "ko" ? koBase : enBase;

  if (hasEvent) {
    base.unshift({
      id: "event",
      headline: lang === "ko" ? "지금, 놓치면 아쉬운 소식" : "Something special is happening.",
      conditions: { has_event: true },
    });
  }

  // category guardrails
  for (const c of base) {
    if (major) c.conditions.category_major = [major];
    if (isAdult) c.conditions.adult = true;
  }

  return {
    version: 1,
    generated_at: nowIso(),
    lang,
    copies: base.slice(0, 10),
    notes: { source: "fallback" },
  };
}

serve(async (req) => {
  if (req.method !== "POST") return json(405, { message: "POST only" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(500, { message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
    const DEEPSEEK_API_BASE = Deno.env.get("DEEPSEEK_API_BASE") ?? "https://api.deepseek.com/v1";
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
    const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.1-70b-versatile";

    const body = (await req.json().catch(() => null)) as ReqBody | null;
    const businessId = body?.business_id ?? body?.businessId ?? null;
    if (!businessId) return json(400, { message: "business_id required" });

    const lang = normalizeAiLanguage(body?.lang ?? body?.target_lang ?? body?.target_language);
    const dryRun = !!body?.dry_run;
    const withCopies = body?.with_copies ?? true;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const now = nowIso();

    const bizRes = await admin
      .from("businesses")
      .select(
        "id,name,address,one_line_intro,description,category_major,category_minor,facilities,logo_image_url,main_image_url,hero_image_url,profile_json,is_adult,has_active_event",
      )
      .eq("id", businessId)
      .maybeSingle();

    if (bizRes.error || !bizRes.data) {
      return json(404, { message: "BUSINESS_NOT_FOUND" });
    }
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
      : ({ data: [], error: null } as any);
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

    const { system, user } = buildPrompt({ biz, menus, menuItems, photos, events, feeds, lang, withCopies });
    const targetLanguageName = AI_LANGUAGE_NAMES[lang] ?? "Korean";

    let briefing = "";
    let aiCopiesPayload: AICopiesPayload | null = null;

    try {
      const runModel = async (systemContent: string, userContent: string) => {
        if (DEEPSEEK_API_KEY) {
          const ds = await deepseekChat(
            DEEPSEEK_API_KEY,
            DEEPSEEK_API_BASE,
            [
              { role: "system", content: systemContent },
              { role: "user", content: userContent },
            ],
            0.35,
            withCopies ? 1400 : 900,
          );
          return ds?.choices?.[0]?.message?.content?.trim?.() ?? "";
        }

        if (GROQ_API_KEY) {
          const gr = await groqChat(
            GROQ_API_KEY,
            GROQ_MODEL,
            [
              { role: "system", content: systemContent },
              { role: "user", content: userContent },
            ],
            0.35,
            withCopies ? 1400 : 900,
          );
          return gr?.choices?.[0]?.message?.content?.trim?.() ?? "";
        }

        return "";
      };

      const parseContent = (content: string) => {
        const obj = extractFirstJsonObject(content);
        let parsedBriefing = "";
        let parsedCopies: AICopiesPayload | null = null;

        if (obj && typeof obj === "object") {
          if (typeof obj.briefing === "string") parsedBriefing = obj.briefing.trim();
          if (withCopies) {
            const sanitized = sanitizeCopies(obj, lang, biz);
            if (sanitized) parsedCopies = sanitized;
          }
        }

        return { parsedBriefing, parsedCopies };
      };

      let content = await runModel(system, user);
      let parsed = parseContent(content);

      if (hasLikelyKoreanOutput(parsed.parsedBriefing, lang)) {
        const strictSystem = `${system}\n\n[CRITICAL LANGUAGE ENFORCEMENT]\nThe requested target language is ${targetLanguageName}. Do not write the briefing or copy headlines in Korean. Translate Korean facts into ${targetLanguageName}. Return JSON only.`;
        const strictUser = `${user}\n\nRegenerate the JSON. The previous answer was in Korean. The new briefing and all headline values must be in ${targetLanguageName}. Korean may appear only inside proper nouns, business names, menu names, addresses, or brand names.`;
        content = await runModel(strictSystem, strictUser);
        parsed = parseContent(content);
      }

      briefing = parsed.parsedBriefing;
      aiCopiesPayload = parsed.parsedCopies;

      if (!briefing && withCopies && !aiCopiesPayload) {
        aiCopiesPayload = buildFallbackCopies(lang, biz);
      }
    } catch (e) {
      console.error("briefing/copies generation failed", e);
      briefing = "";
      aiCopiesPayload = withCopies ? buildFallbackCopies(lang, biz) : null;
    }

    if (withCopies && !aiCopiesPayload) {
      aiCopiesPayload = buildFallbackCopies(lang, biz);
    }

    let aiCopiesSaved = false;
    if (!dryRun) {
      const patch: Record<string, any> = {};
      if (briefing) {
        patch.ai_briefing = briefing;
        patch.ai_briefing_updated_at = now;
      }
      if (withCopies && aiCopiesPayload) {
        patch.ai_copies = aiCopiesPayload;
        aiCopiesSaved = true;
      }
      if (Object.keys(patch).length > 0) {
        await admin.from("businesses").update(patch).eq("id", businessId);
      }
    }

    return json(200, {
      briefing,
      updated_at: now,
      lang,
      saved: !dryRun,
      with_copies: withCopies,
      ai_copies_saved: !dryRun ? aiCopiesSaved : false,
      ai_copies_count: aiCopiesPayload?.copies?.length ?? 0,
      ai_copies: aiCopiesPayload ?? null,
    });
  } catch (err: any) {
    console.error("ai-briefing fatal error", err);
    return json(500, {
      message: "Internal Server Error",
      detail: err?.message ?? String(err),
    });
  }
});