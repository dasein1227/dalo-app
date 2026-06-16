// supabase/functions/group-translate/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * group-translate (그룹/오픈/비콘 전용 번역)
 * - 핵심 목표: DM(1:1) 번역 시스템(chat-translate)을 침해하지 않는다.
 * - 기본 정책: tier가 명시되지 않으면 free로 간주 → 번역하지 않고 원문 반환
 * - 결과는 DB에 저장하지 않는다(요청자 로컬 캐시에만 저장하는 설계)
 *
 * 입력 호환:
 * - { text, target_lang, tier, tone, room_type }  (Chat.tsx 스타일)
 * - { text, to, tier, mode, room_type }          (기타 호출자)
 *
 * 응답:
 * - { translated_text, result, engine, tier, mode, to }
 */

// CORS 공통 헤더
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// JSON 응답 헤더
const JSON_HEADERS = {
  ...CORS,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

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

type TranslateMode = "business" | "polite" | "casual" | "neutral" | "creative";

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

function normalizeTier(input: unknown): "free" | "mid" | "high" {
  const s = typeof input === "string" ? input.toLowerCase() : "";
  switch (s) {
    case "high":
    case "premium":
      return "high";
    case "mid":
    case "standard":
    case "basic":
      return "mid";
    case "free":
      return "free";
    default:
      // ✅ group-translate 기본은 "free" (명시적으로 요청했을 때만 번역)
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

function normalizeRoomType(input: unknown): "group" | "open" | "beacon" | "" {
  const s = typeof input === "string" ? input.toLowerCase().trim() : "";
  if (s === "group" || s === "open" || s === "beacon") return s;
  return "";
}

/**
 * GPT 번역 (tier=high)
 * - OPENAI_API_KEY 필요
 */
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
      // ⚠️ DM과 정책 분리 목적이므로 모델/프롬프트는 그대로 가져오되,
      // 필요하면 여기서 group 전용으로 바꾸면 됨
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

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(
      `OPENAI non-2xx: ${resp.status} ${resp.statusText} ${t}`.trim(),
    );
  }

  const payload = await resp.json();
  return payload?.choices?.[0]?.message?.content?.trim() ?? text;
}

/**
 * DeepL 번역 (tier=mid)
 * - DEEPL_API_KEY 필요
 */
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

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`DEEPL non-2xx: ${resp.status} ${resp.statusText} ${t}`.trim());
  }

  const payload = await resp.json();
  return payload?.translations?.[0]?.text ?? text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const text = String(body?.text ?? "").trim();

    // Chat.tsx: target_lang, 기타: to
    const to =
      String(body?.to ?? "").trim() ||
      String(body?.target_lang ?? "").trim() ||
      "";

    // 그룹 전용: room_type이 없으면 허용은 하되, 클라이언트에서 반드시 넘기는 걸 권장
    const roomType = normalizeRoomType(body?.room_type);

    // (선택) room_type이 명시된 경우 group/open/beacon 외는 차단
    if (String(body?.room_type ?? "").trim() && !roomType) {
      return json({ error: "invalid_room_type" }, 400);
    }

    // Chat.tsx: tone, 기타: mode
    const mode = normalizeMode(body?.mode ?? body?.tone);

    // ✅ 기본 free (명시적으로 tier를 줘야 번역됨)
    const tier = normalizeTier(body?.tier);

    // (선택) 과도한 본문 방지 (서버 비용/지연 방지)
    // 필요하면 숫자 조정
    const MAX_CHARS = 3000;
    if (text.length > MAX_CHARS) {
      return json({ error: "text_too_long", max: MAX_CHARS }, 413);
    }

    if (!text || !to) {
      return json({ error: "Missing input" }, 400);
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
      // free → 번역 금지(원문 유지)
      result = text;
      engine = "none";
    }

    return json({
      translated_text: result, // ✅ 클라이언트 호환 키
      result,                  // ✅ 기존 호환 키
      engine,
      tier,
      mode,
      to: to.toLowerCase(),
      room_type: roomType || undefined,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
