import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAP: Record<string, string> = {
  EN:"EN", ES:"ES", FR:"FR", DE:"DE", IT:"IT", PT:"PT",
  NL:"NL", PL:"PL", RU:"RU", JA:"JA", KO:"KO", ZH:"ZH",
  TR:"TR", SV:"SV", ID:"ID", TH:"TH", UK:"UK", RO:"RO",
  CS:"CS", DA:"DA", EL:"EL", FI:"FI", HU:"HU", SK:"SK",
  SL:"SL", BG:"BG", ET:"ET", LT:"LT", LV:"LV",
  AR:"AR" // 아랍어 사용
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { text, to } = await req.json();
    const target = MAP[String(to ?? "").trim().toUpperCase()];
    const key = Deno.env.get("DEEPL_API_KEY");

    if (!text || !to) {
      return new Response(JSON.stringify({ error: "Missing 'text' or 'to'." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (!key) {
      return new Response(JSON.stringify({ error: "DEEPL_API_KEY not set" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (!target) {
      // 미지원 언어면 그냥 원문 반환 (원하면 여기서 다른 엔진으로 분기)
      return new Response(JSON.stringify({ result: String(text), engine: "fallback" }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const endpoint = key.includes(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ text: String(text), target_lang: target }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: "deepl_error", detail: t }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const payload = await resp.json();
    const translated = payload?.translations?.[0]?.text ?? "";
    return new Response(JSON.stringify({ result: translated, engine: "deepl" }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
