// supabase/functions/translate-text/index.ts

// ✅ Supabase Edge Functions 타입 선언 (Deno+Edge 런타임 타입 제공)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ✅ Deno 표준 라이브러리 (버전 고정)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
} as const;

// ✅ 환경변수 (DeepL 키)
const DEEPL_KEY: string = Deno.env.get("DEEPL_KEY") ?? "";
if (!DEEPL_KEY) {
  console.error("❌ Missing DEEPL_KEY environment variable");
}

// ✅ DeepL 호출
async function deepl(text: string, target: string): Promise<{ text: string; detected: string | null }> {
  const endpoint = DEEPL_KEY.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  const body = new URLSearchParams();
  body.append("text", text);
  body.append("target_lang", target.toUpperCase());

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${DEEPL_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("DeepL API Error:", errText);
    throw new Error(`DeepL API error: ${res.status} ${errText}`);
  }

  const json = await res.json();
  const tr = json?.translations?.[0] ?? {};
  return {
    text: (tr.text as string) ?? "",
    detected: (tr.detected_source_language as string) ?? null,
  };
}

// ✅ HTTP 핸들러
serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as { text?: string; target?: string };
    const text = payload?.text?.toString() ?? "";
    const target = payload?.target?.toString() ?? "";

    if (!text || !target) {
      return new Response(
        JSON.stringify({ error: "Missing 'text' or 'target' parameter" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const result = await deepl(text, target);
    return new Response(JSON.stringify(result), { headers: corsHeaders });
  } catch (err: unknown) {
    const message = (err instanceof Error && err.message) ? err.message : String(err);
    console.error("translate-text error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
