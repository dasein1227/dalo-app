// supabase/functions/chat-translate/index.ts
// -----------------------------------------------------------------------------
// Internal translator (번역 엔진 전용)
//   - 정책 결정 X (tier/target_lang/tone/context는 호출자가 결정)
//   - ✅ 서비스 롤만 호출 가능 (Bearer SUPABASE_SERVICE_ROLE_KEY 강제)
//   - free: 번역 없음 (translated_text=null)
//   - mid: DeepL (키 없으면 null)
//   - high: GPT(문맥+톤+언어감지) + 실패/키없음 시 DeepL fallback
//
// INPUT:  { text, target_lang, tier, tone?, context? }
// OUTPUT: {
//   translated_text: string|null,
//   provider: 'openai'|'deepl'|'none',
//   detected_source_lang: string|null,
//   same_language: boolean
// }
//
// IMPORTANT:
//   - same_language=true일 때도 translated_text에는 원문을 그대로 담아 반환한다.
//     현재 worker가 translated_text=null을 실패로 처리하기 때문에, worker 패치 전/후 모두
//     안전하게 동작시키기 위한 하위호환 정책이다.
//   - worker 패치 후에는 same_language=true를 보고 DB content 업데이트 없이 job done 처리하면 된다.
//
// ENV:
//  - SUPABASE_SERVICE_ROLE_KEY (auth)
//  - OPENAI_API_KEY, OPENAI_MODEL_HIGH
//  - DEEPL_KEY or DEEPL_API_KEY
// -----------------------------------------------------------------------------

type Tier = "free" | "mid" | "high";
type Tone = "business" | "polite" | "casual" | "neutral" | "creative";
type Provider = "openai" | "deepl" | "none";
type ContextItem = { speaker: "sender" | "other"; text: string };
type TranslateResult = {
  translated_text: string | null;
  provider: Provider;
  detected_source_lang: string | null;
  same_language: boolean;
  error?: string | null;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function asTier(v: unknown): Tier {
  if (v === "high" || v === "mid") return v;
  return "free";
}
function asTone(v: unknown): Tone {
  if (v === "business" || v === "polite" || v === "casual" || v === "creative") return v;
  return "neutral";
}

function normalizeLangCode(raw: unknown): string | null {
  const v = String(raw ?? "").trim().replace(/_/g, "-").toLowerCase();
  if (!v) return null;

  if (v === "ko" || v === "kor" || v === "kr") return "KO";
  if (v === "en" || v === "eng") return "EN";
  if (v === "ja" || v === "jpn" || v === "jp") return "JA";

  if (v === "zh" || v === "zho" || v === "chi" || v === "cmn") return "ZH";
  if (v === "zh-cn" || v === "zh-sg" || v === "zh-hans") return "ZH-HANS";
  if (v === "zh-tw" || v === "zh-hk" || v === "zh-mo" || v === "zh-hant") return "ZH-HANT";

  return v.toUpperCase();
}

function sameNormalizedLanguage(source: string | null, target: string | null): boolean {
  if (!source || !target) return false;
  const src = normalizeLangCode(source);
  const tgt = normalizeLangCode(target);
  if (!src || !tgt) return false;

  // Do not collapse ZH-HANS and ZH-HANT here.
  // Simplified <-> Traditional conversion must still be allowed when the user
  // explicitly selects a different Chinese variant.
  return src === tgt;
}

function stripJsonFence(s: string): string {
  const text = s.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? text).trim();
}

function extractFirstJsonObject(s: string): string | null {
  const text = stripJsonFence(s);
  if (text.startsWith("{") && text.endsWith("}")) return text;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1).trim();
  return null;
}

function normalizeTranslationResult(args: {
  translatedText: string | null;
  provider: Provider;
  detectedSourceLang?: string | null;
  sameLanguage?: boolean | null;
  originalText: string;
  targetLang: string;
  error?: string | null;
}): TranslateResult {
  const detected = normalizeLangCode(args.detectedSourceLang);
  const target = normalizeLangCode(args.targetLang);
  const same = Boolean(args.sameLanguage) || sameNormalizedLanguage(detected, target);
  const translated = isNonEmptyString(args.translatedText)
    ? args.translatedText.trim()
    : same
      ? args.originalText.trim()
      : null;

  return {
    translated_text: translated,
    provider: translated ? args.provider : "none",
    detected_source_lang: detected,
    same_language: same,
    error: args.error ?? null,
  };
}

// ENV
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
// ✅ 기본값을 더 “현재 표준”으로: 필요하면 ENV로 교체
const OPENAI_MODEL_HIGH = Deno.env.get("OPENAI_MODEL_HIGH") ?? "gpt-5.1";
const DEEPL_KEY = Deno.env.get("DEEPL_KEY") ?? Deno.env.get("DEEPL_API_KEY") ?? "";

// ---------------- DeepL ----------------
async function translateWithDeepL(text: string, target_lang: string): Promise<TranslateResult> {
  if (!DEEPL_KEY) {
    return normalizeTranslationResult({
      translatedText: null,
      provider: "none",
      originalText: text,
      targetLang: target_lang,
      error: "missing_deepl_key",
    });
  }

  const target = target_lang.trim().toUpperCase();
  const endpoints = ["https://api.deepl.com/v2/translate", "https://api-free.deepl.com/v2/translate"];
  let lastError: string | null = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
        },
        body: new URLSearchParams({ text, target_lang: target }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        lastError = `deepl non-200: ${res.status} ${t}`;
        continue;
      }

      const data = await res.json().catch(() => null);
      const translation = data?.translations?.[0];
      const out = typeof translation?.text === "string" && translation.text.trim()
        ? translation.text.trim()
        : null;
      const detected = normalizeLangCode(translation?.detected_source_language);

      if (out || detected) {
        return normalizeTranslationResult({
          translatedText: out,
          provider: "deepl",
          detectedSourceLang: detected,
          sameLanguage: sameNormalizedLanguage(detected, target),
          originalText: text,
          targetLang: target,
        });
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // try next endpoint
    }
  }

  return normalizeTranslationResult({
    translatedText: null,
    provider: "none",
    originalText: text,
    targetLang: target,
    error: lastError ?? "deepl_empty_translation",
  });
}

// ---------------- OpenAI (Responses API) ----------------
function toneGuideline(tone: Tone): string {
  switch (tone) {
    case "business":
      return "Tone: business. Professional, formal, concise, credible. No slang. Use business-appropriate politeness in the target language.";
    case "polite":
      return "Tone: polite. Respectful and warm. Natural politeness. Avoid stiff corporate phrasing.";
    case "casual":
      return "Tone: casual. Friendly, natural conversational speech. Mild colloquialisms allowed if appropriate in the target language.";
    case "creative":
      return "Tone: creative. Preserve meaning strictly, but allow stylish expression suitable for the context.";
    case "neutral":
    default:
      return "Tone: neutral. Standard register focused on accuracy and readability. Do not add emotion.";
  }
}

function formatContext(context: ContextItem[]): string {
  if (!context.length) return "(no prior context)";
  return context.map((m) => `${m.speaker === "sender" ? "SENDER" : "OTHER"}: ${m.text}`).join("\n");
}

function extractOpenAIOutputText(data: any): string | null {
  try {
    const output = data?.output ?? [];
    for (const item of output) {
      const content = item?.content ?? [];
      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string" && c.text.trim()) {
          return c.text.trim();
        }
      }
    }
  } catch {
    // ignore
  }

  const alt = data?.output_text;
  if (typeof alt === "string" && alt.trim()) return alt.trim();
  return null;
}

function parseOpenAITranslateResult(raw: string, originalText: string, targetLang: string): TranslateResult {
  const jsonText = extractFirstJsonObject(raw);
  if (!jsonText) {
    // 하위호환 fallback: 모델이 번역문만 반환한 경우에도 기존 동작을 유지한다.
    return normalizeTranslationResult({
      translatedText: raw,
      provider: "openai",
      originalText,
      targetLang,
    });
  }

  try {
    const obj = JSON.parse(jsonText) as Record<string, unknown>;
    const translatedRaw = obj.translated_text;
    const translatedText = typeof translatedRaw === "string" ? translatedRaw : null;
    const detectedSourceLang = typeof obj.detected_source_lang === "string" ? obj.detected_source_lang : null;
    const sameLanguage = typeof obj.same_language === "boolean" ? obj.same_language : null;

    return normalizeTranslationResult({
      translatedText,
      provider: "openai",
      detectedSourceLang,
      sameLanguage,
      originalText,
      targetLang,
    });
  } catch {
    return normalizeTranslationResult({
      translatedText: raw,
      provider: "openai",
      originalText,
      targetLang,
    });
  }
}

async function translateWithOpenAI(args: {
  text: string;
  target_lang: string;
  tone: Tone;
  context: ContextItem[];
}): Promise<TranslateResult> {
  if (!OPENAI_API_KEY) {
    return normalizeTranslationResult({
      translatedText: null,
      provider: "none",
      originalText: args.text,
      targetLang: args.target_lang,
      error: "missing_openai_key",
    });
  }

  const system = [
    "You are a world-class translator and language identifier for a global chat application.",
    "Your job is to detect the source language of the sender's message and translate it into the requested target language.",
    "Use the conversation context only for disambiguation, pronouns, tone, and references. Do not translate prior context messages.",
    "Return ONLY one valid JSON object. No markdown, no code fences, no explanations.",
    "JSON schema:",
    '{"detected_source_lang":"ISO-639-1 or BCP-47 uppercase code, or null","same_language":boolean,"translated_text":"string or null"}',
    "Language code examples: KO, EN, JA, ZH-HANS, ZH-HANT, FR, ES, DE, VI, AR, HE, HI, TH, RU, ID, TR.",
    "If the source language and target language are effectively the same, set same_language=true and set translated_text to the original message exactly.",
    "If they are different, set same_language=false and set translated_text to the translated message only.",
    "Preserve names, numbers, emojis, URLs, and formatting exactly as-is unless the target language requires minimal grammatical adjustment.",
    toneGuideline(args.tone),
  ].join("\n");

  const user = [
    `TARGET_LANGUAGE: ${args.target_lang}`,
    "",
    "CONTEXT (up to 20 previous messages, chronological):",
    formatContext(args.context),
    "",
    "MESSAGE_TO_TRANSLATE (from SENDER):",
    args.text,
    "",
    "Return ONLY the JSON object.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL_HIGH,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
      // ✅ 번역은 안정적으로
      temperature: 0.2,
      // ✅ 길어지면 앞부분 자동 트렁케이트 (실전 운영 안정성)
      truncation: "auto",
      // JSON + 번역문이면 기존보다 조금 여유 필요
      max_output_tokens: 800,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[openai] non-200:", res.status, t);
    return normalizeTranslationResult({
      translatedText: null,
      provider: "none",
      originalText: args.text,
      targetLang: args.target_lang,
      error: `openai non-200: ${res.status} ${t}`,
    });
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    return normalizeTranslationResult({
      translatedText: null,
      provider: "none",
      originalText: args.text,
      targetLang: args.target_lang,
      error: "openai_invalid_json_response",
    });
  }

  const raw = extractOpenAIOutputText(data);
  if (!raw) {
    return normalizeTranslationResult({
      translatedText: null,
      provider: "none",
      originalText: args.text,
      targetLang: args.target_lang,
      error: "openai_empty_output",
    });
  }

  return parseOpenAITranslateResult(raw, args.text, args.target_lang);
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------- Main ----------------
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "Method Not Allowed" });
    }

    // ✅ service role only
    const auth = req.headers.get("Authorization") ?? "";
    const expected = `Bearer ${SERVICE_ROLE_KEY}`;
    if (!SERVICE_ROLE_KEY || auth !== expected) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const body = await req.json().catch(() => ({} as any));
    const text = (body as any)?.text;
    const target_lang = (body as any)?.target_lang;
    const tier: Tier = asTier((body as any)?.tier);
    const tone: Tone = asTone((body as any)?.tone);

    const rawContext = (body as any)?.context;
    const context: ContextItem[] = Array.isArray(rawContext)
      ? rawContext
          .map((x: any) => ({
            speaker: x?.speaker === "other" ? "other" : "sender",
            text: typeof x?.text === "string" ? x.text : "",
          }))
          .filter((x: ContextItem) => x.text.trim().length > 0)
          .slice(-20)
      : [];

    if (!isNonEmptyString(text) || !isNonEmptyString(target_lang)) {
      return jsonResponse(400, { error: "Missing text/target_lang" });
    }

    // Free Tier 처리
    if (tier === "free") {
      return jsonResponse(200, {
        translated_text: null,
        provider: "none",
        detected_source_lang: null,
        same_language: false,
      });
    }

    let result: TranslateResult = normalizeTranslationResult({
      translatedText: null,
      provider: "none",
      originalText: text,
      targetLang: target_lang,
    });

    // High Tier -> OpenAI 시도. high에서는 언어 감지까지 GPT가 담당한다.
    if (tier === "high") {
      result = await translateWithOpenAI({ text, target_lang, tone, context });
    }

    // OpenAI 실패 혹은 Mid Tier -> DeepL 시도
    if (!result.translated_text) {
      const fallback = await translateWithDeepL(text, target_lang);
      if (fallback.translated_text) {
        result = fallback;
      } else if (!result.error) {
        result = fallback;
      }
    }

    return jsonResponse(200, {
      translated_text: result.translated_text,
      provider: result.translated_text ? result.provider : "none",
      detected_source_lang: result.detected_source_lang,
      same_language: result.same_language,
      error: result.translated_text ? null : result.error ?? "empty_translation",
    });
  } catch (e) {
    console.error("[chat-translate] error:", e);
    return jsonResponse(500, { error: (e as any)?.message ?? String(e) });
  }
});
