// supabase/functions/translate-on-demand/index.ts
// -----------------------------------------------------------------------------
// Swipe 전용 "개인화 번역" (서버 저장 없음)
//
// ✅ 목적
//   - 그룹(및 필요시 1:1)에서 사용자가 스와이프하면,
//     requester 프로필 기준(view_lang, tier, tone)으로 번역해 "결과만" 반환
//   - 번역 결과는 클라 로컬DB에 저장 (서버 DB 저장 금지)
//
// ✅ 보안(중요)
//   - requester tier/view_lang/tone은 클라가 보내지 않는다.
//   - Authorization(JWT)로 requester 확정 후 profiles를 서버가 직접 조회한다.
//
// INPUT:
//  { room_id:number, message_id:number, from?:'content'|'original' (default 'content') }
//
// OUTPUT:
//  { ok, translated_text, provider, tier_used, target_lang, tone_used, context_used_count, reason? }
//
// NOTE
//   - 문맥은 "해당 message_id 이전" 텍스트 메시지 최대 20개 (chronological)
// -----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAT_TRANSLATE_URL = `${SUPABASE_URL}/functions/v1/chat-translate`;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Tier = "free" | "mid" | "high";
type Tone = "business" | "polite" | "casual" | "neutral" | "creative";
type ContextItem = { speaker: "sender" | "other"; text: string };

type ProfileRow = {
  user_id: string;
  user_tier: Tier | null;
  translation_tier: Tier | null;
  auto_translate_default: boolean | null;
  preferred_lang: string | null;
  view_lang: string | null;
  translation_tone_default: Tone | null;
};

type ChatMemberSetting = {
  user_id: string;
  auto_translate: boolean | null;
  translation_tier: Tier | null;
  view_lang_override: string | null;
  translation_tone: Tone | null;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function asTone(v: unknown): Tone {
  if (v === "business" || v === "polite" || v === "casual" || v === "creative") return v;
  return "neutral";
}
function asTier(v: unknown, fallback: Tier = "free"): Tier {
  if (v === "free" || v === "mid" || v === "high") return v;
  return fallback;
}
function upperLang(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  return s ? s : null;
}

function detectLangHeuristic(text: string): string | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(s)) return "KO";
  if (/[ぁ-ゔァ-ヴー々〆〤]/.test(s)) return "JA";
  if (/[A-Za-z]/.test(s)) return "EN";
  return null;
}

function effectiveTier(p: ProfileRow, m: ChatMemberSetting | null): Tier {
  // Translation OFF in this room must block new swipe/manual requests.
  if (m?.auto_translate === false) return "free";
  if (m?.auto_translate == null && p.auto_translate_default === false) return "free";
  const userTier = asTier(p.user_tier ?? "free");
  const wanted = asTier(m?.translation_tier ?? p.translation_tier ?? userTier);
  if (userTier === "free") return "free";
  if (userTier === "mid" && wanted === "high") return "mid";
  return wanted;
}

function effectiveTargetLang(p: ProfileRow, m: ChatMemberSetting | null): string | null {
  // CO·ONN room-local receive language source of truth.
  return upperLang(m?.view_lang_override) ?? upperLang(p.view_lang) ?? upperLang(p.preferred_lang);
}

function effectiveTone(p: ProfileRow, m: ChatMemberSetting | null): Tone {
  return asTone(m?.translation_tone ?? p.translation_tone_default);
}

function parseContentText(content: any): string | null {
  if (typeof content !== "string") return null;
  const s = content.trim();
  if (!s) return null;

  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try {
      const obj = JSON.parse(s);
      if (typeof obj === "string" && obj.trim()) return obj;
      if (obj && typeof obj === "object") {
        if (typeof (obj as any).text === "string" && (obj as any).text.trim()) return (obj as any).text;
        if (typeof (obj as any).content === "string" && (obj as any).content.trim()) return (obj as any).content;
      }
    } catch {
      // ignore
    }
  }
  return s;
}
function pickTextFromOriginal(original: any): string | null {
  if (typeof original === "string" && original.trim()) return original.trim();
  if (original && typeof original === "object") {
    if (typeof (original as any).text === "string" && (original as any).text.trim()) return (original as any).text.trim();
    if (typeof (original as any).content === "string" && (original as any).content.trim()) return (original as any).content.trim();
  }
  return null;
}

async function getRequesterId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const jwt = m?.[1];
  if (!jwt) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function getMemberSetting(room_id: number, user_id: string): Promise<ChatMemberSetting | null> {
  const { data, error } = await supabaseAdmin
    .from("chat_members")
    .select("user_id,auto_translate,translation_tier,view_lang_override,translation_tone")
    .eq("room_id", room_id)
    .eq("user_id", user_id)
    .eq("active", true)
    .is("left_at", null)
    .maybeSingle();

  if (error) return null;
  return (data ?? null) as ChatMemberSetting | null;
}

async function getProfile(user_id: string): Promise<ProfileRow> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id,user_tier,translation_tier,auto_translate_default,preferred_lang,view_lang,translation_tone_default")
    .eq("user_id", user_id)
    .single();

  if (error) throw new Error(`profiles fetch failed(${user_id}): ${error.message}`);
  return data as ProfileRow;
}

async function getMessage(room_id: number, message_id: number): Promise<any | null> {
  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id, room_id, sender_id, kind, content, original, source_lang, translated_text, delete_at, created_at")
    .eq("room_id", room_id)
    .eq("id", message_id)
    .maybeSingle();

  if (error) throw new Error(`chat_messages fetch failed: ${error.message}`);
  return data ?? null;
}

async function fetchContextBefore(room_id: number, before_message_id: number, requester_id: string, limit = 20): Promise<ContextItem[]> {
  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id, sender_id, kind, content, original, delete_at")
    .eq("room_id", room_id)
    .is("delete_at", null)
    .lt("id", before_message_id)
    .order("id", { ascending: false })
    .limit(Math.max(1, Math.min(20, limit)));

  if (error) {
    console.error("[context] fetch failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as any[];
  rows.reverse(); // chronological

  const out: ContextItem[] = [];
  for (const r of rows) {
    if (r?.kind && r.kind !== "text") continue;

    let txt = parseContentText(r?.content);
    if (!txt) txt = pickTextFromOriginal(r?.original);

    if (!txt || !txt.trim()) continue;
    out.push({ speaker: r.sender_id === requester_id ? "sender" : "other", text: txt.trim() });
  }
  return out.slice(-20);
}

async function callChatTranslate(args: {
  text: string;
  target_lang: string;
  tier: Tier;
  tone: Tone;
  context: ContextItem[];
}): Promise<{ translated_text: string | null; provider: "openai" | "deepl" | "none" }> {
  const res = await fetch(CHAT_TRANSLATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`, // internal
    },
    body: JSON.stringify({
      text: args.text,
      target_lang: args.target_lang,
      tier: args.tier,
      tone: args.tone,
      context: args.context,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[chat-translate] non-200:", res.status, t);
    return { translated_text: null, provider: "none" };
  }

  const data = await res.json().catch(() => null);
  const tt = typeof data?.translated_text === "string" && data.translated_text.trim() ? data.translated_text.trim() : null;
  const pv = data?.provider === "openai" || data?.provider === "deepl" ? data.provider : "none";
  return { translated_text: tt, provider: pv };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const requester_id = await getRequesterId(req);
    if (!requester_id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({} as any));
    const room_id = typeof body?.room_id === "string" ? Number(body.room_id) : body?.room_id;
    const message_id = typeof body?.message_id === "string" ? Number(body.message_id) : body?.message_id;
    const from = body?.from === "original" ? "original" : "content";

    if (!Number.isFinite(room_id) || !Number.isFinite(message_id)) {
      return new Response(JSON.stringify({ error: "Invalid room_id/message_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // room membership + room-local translation settings
    const member = await getMemberSetting(room_id, requester_id);
    if (!member) {
      return new Response(JSON.stringify({ ok: false, translated_text: null, provider: "none", reason: "not_member" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const profile = await getProfile(requester_id);
    const tier_used = effectiveTier(profile, member);
    const target_lang = effectiveTargetLang(profile, member);
    const tone_used: Tone = effectiveTone(profile, member);

    if (!isNonEmptyString(target_lang)) {
      return new Response(JSON.stringify({
        ok: true, translated_text: null, provider: "none",
        tier_used, target_lang, tone_used, context_used_count: 0, reason: "no_target_lang"
      }), { headers: { "Content-Type": "application/json" } });
    }

    if (tier_used === "free") {
      return new Response(JSON.stringify({
        ok: true, translated_text: null, provider: "none",
        tier_used, target_lang, tone_used, context_used_count: 0, reason: "free"
      }), { headers: { "Content-Type": "application/json" } });
    }

    const msg = await getMessage(room_id, message_id);
    if (!msg || msg.delete_at) {
      return new Response(JSON.stringify({
        ok: true, translated_text: null, provider: "none",
        tier_used, target_lang, tone_used, context_used_count: 0, reason: "no_text"
      }), { headers: { "Content-Type": "application/json" } });
    }

    // text to translate
    let text: string | null = null;
    if (from === "original") text = pickTextFromOriginal(msg.original);
    else {
      text = parseContentText(msg.content);
      // New CO·ONN invariant: content is translation-only for text rows.
      // If content is empty because no translation exists yet, translate the source in original.
      if (!text) text = pickTextFromOriginal(msg.original);
    }

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({
        ok: true, translated_text: null, provider: "none",
        tier_used, target_lang, tone_used, context_used_count: 0, reason: "no_text"
      }), { headers: { "Content-Type": "application/json" } });
    }

    const source_lang = upperLang(msg.source_lang) ?? detectLangHeuristic(text);
    const normalized_target_lang = upperLang(target_lang);
    if (source_lang && normalized_target_lang && source_lang === normalized_target_lang) {
      return new Response(JSON.stringify({
        ok: true, translated_text: null, provider: "none",
        tier_used, target_lang: normalized_target_lang, tone_used, context_used_count: 0, reason: "same_language"
      }), { headers: { "Content-Type": "application/json" } });
    }

    const context = tier_used === "high"
      ? await fetchContextBefore(room_id, message_id, requester_id, 20)
      : [];

    const result = await callChatTranslate({ text, target_lang, tier: tier_used, tone: tone_used, context });

    return new Response(JSON.stringify({
      ok: true,
      translated_text: result.translated_text,
      provider: result.translated_text ? result.provider : "none",
      tier_used,
      target_lang,
      tone_used,
      context_used_count: context.length,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[translate-on-demand] error:", e);
    return new Response(JSON.stringify({ error: (e as any)?.message ?? String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
