// supabase/functions/chat-translate/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// CORS 공통 헤더
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// DeepL 언어 코드 매핑
const MAP: Record<string, string> = {
  EN: "EN",
  ES: "ES",
  FR: "FR",
  DE: "DE",
  IT: "IT",
  PT: "PT",
  NL: "NL",
  PL: "PL",
  RU: "RU",
  JA: "JA",
  KO: "KO",
  ZH: "ZH",
  TR: "TR",
  SV: "SV",
  ID: "ID",
  TH: "TH",
  UK: "UK",
  RO: "RO",
  CS: "CS",
  DA: "DA",
  EL: "EL",
  FI: "FI",
  HU: "HU",
  SK: "SK",
  SL: "SL",
  BG: "BG",
  ET: "ET",
  LT: "LT",
  LV: "LV",
  AR: "AR",
};

// 번역 모드 타입
type TranslateMode =
  | "business"
  | "polite"
  | "casual"
  | "neutral"
  | "creative";

// GPT 프롬프트용 스타일 문구
function getStylePrompt(mode: TranslateMode): string {
  switch (mode) {
    case "business":
      return "대상 언어에서 아주 정중하고 전문적인 비즈니스 문서 톤으로 번역.";
    case "polite":
      return "대상 언어에서 자연스럽고 공손한 톤으로 번역.";
    case "casual":
      return "대상 언어에서 친근한 대화체로 번역.";
    case "neutral":
      return "대상 언어의 기본 중립 톤으로 번역.";
    case "creative":
      return "조금 더 표현력 있지만 의미는 유지하며 번역.";
    default:
      return "자연스럽고 읽기 쉬운 말투로 번역.";
  }
}

async function translateWithGPT(text: string, to: string, mode: TranslateMode) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const stylePrompt = getStylePrompt(mode);
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `너는 번역 전문 AI다. 대상 언어(${to.toUpperCase()})로 자연스럽고 정확하게 번역하라.`,
        },
        {
          role: "user",
          content: `${stylePrompt}\n\n[원문]\n${text}\n\n번역만 출력.`,
        },
      ],
    }),
  });

  const payload = await resp.json();
  return payload?.choices?.[0]?.message?.content?.trim() ?? text;
}

async function translateWithDeepL(text: string, to: string) {
  const key = Deno.env.get("DEEPL_API_KEY");
  if (!key) throw new Error("DEEPL_API_KEY not set");

  const target = MAP[to.toUpperCase()];
  if (!target) return text;

  const endpoint = key.includes(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ text, target_lang: target }),
  });

  const payload = await resp.json();
  return payload?.translations?.[0]?.text ?? text;
}

function normalizeTier(input: unknown): "free" | "mid" | "high" {
  const s = typeof input === "string" ? input.toLowerCase() : "free";
  switch (s) {
    case "high":
    case "premium":
      return "high";
    case "mid":
    case "standard":
    case "basic":
      return "mid";
    default:
      return "free";
  }
}

function normalizeMode(input: unknown): TranslateMode {
  const allowed: TranslateMode[] = [
    "business",
    "polite",
    "casual",
    "neutral",
    "creative",
  ];
  return allowed.includes(input as any) ? (input as TranslateMode) : "neutral";
}

/**
 * ✅ 핵심: 클라이언트 호환 레이어
 * - Chat.tsx는 target_lang / tone 으로 보낼 수 있음
 * - translate-text는 to / mode 를 기대함
 * - 여기서 둘 다 수용하고 표준화한다.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json();

    const text = String(body?.text ?? "").trim();

    // to / target_lang 둘 다 받기
    const to =
      String(body?.to ?? "").trim() ||
      String(body?.target_lang ?? "").trim() ||
      "";

    // mode / tone 둘 다 받기 (tone은 기존 Chat UI 명칭)
    const mode = normalizeMode(body?.mode ?? body?.tone);

    const tier = normalizeTier(body?.tier);

    if (!text || !to) {
      return new Response(JSON.stringify({ error: "Missing input" }), {
        status: 400,
        headers: CORS,
      });
    }

    let result = text;
    let engine: "none" | "deepl" | "gpt" = "none";

    if (tier === "high") {
      result = await translateWithGPT(text, to, mode);
      engine = "gpt";
    } else if (tier === "mid") {
      result = await translateWithDeepL(text, to);
      engine = "deepl";
    } else {
      result = text;
      engine = "none";
    }

    // ✅ Chat.tsx가 우선으로 읽는 키를 맞춘다: translated_text
    return new Response(
      JSON.stringify({
        translated_text: result,
        result, // 예비 호환
        engine,
        tier,
        mode,
        to,
      }),
      { headers: CORS },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: CORS,
    });
  }
});
