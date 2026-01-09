// supabase/functions/_shared/ai_profile_shared.ts
// Shared helpers for AI profile refresh (post_tags -> profile_json)
// Designed for Supabase Edge (Deno).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type GroupKey = "atmosphere" | "purpose" | "menu" | "seating" | "amenity" | "category";

export type BusinessRow = {
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
};

export type BusinessMenu = {
  id: string;
  title?: string | null;
};

export type BusinessMenuItem = {
  id: string;
  menu_id: string;
  name: string | null;
  description?: string | null;
  price?: number | null;
  is_signature?: boolean | null;
  sort_order?: number | null;
};

export type AliasRow = {
  raw_norm: string;
  group_key: GroupKey;
  concept_key: string;
  label: string;
  status: "approved" | "pending" | "blocked";
  confidence: number | null;
  evidence: string[] | null;
};

export type TagRow = {
  post_id: string;
  user_id: string;
  tag_text: string;
  tag_norm: string;
  created_at: string;
};

export type PostRow = {
  id: string;
  user_id: string;
  created_at: string;
};

export type ConceptSignal = {
  group: GroupKey;
  concept_key: string;
  label: string;
  users: number;
  posts: number;
  share: number; // posts / mention_posts
  evidence: string[];
};

export type GroupSummary = {
  group: GroupKey;
  top: ConceptSignal[];
  confidence: number; // 0..1
  stats: {
    mention_posts: number;
    mention_users: number;
    mention_tags: number;
  };
};

export type ProfileJsonV1 = {
  version: "biz_profile_v1";
  window_days: number;
  generated_at: string;
  business_id: string;

  facts: {
    name?: string | null;
    address?: string | null;
    one_line_intro?: string | null;
    description?: string | null;
    category_major?: string | null;
    category_minor?: string | null;
    facilities?: string | null;
    menu_highlights?: Array<{ name: string; price?: number | null; is_signature?: boolean | null }>;
  };

  sources: {
    posts_total: number;
    tags_total: number;
    unique_users_total: number;
  };

  groups: Record<GroupKey, GroupSummary>;
  category_top3: ConceptSignal[];
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const uniq = <T>(arr: T[]) => Array.from(new Set(arr));
export const nowIso = () => new Date().toISOString();

export const daysAgoIso = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

export const detectLang = (s: string): "ko" | "en" | "und" => {
  if (!s) return "und";
  if (/[가-힣]/.test(s)) return "ko";
  if (/[A-Za-z]/.test(s)) return "en";
  return "und";
};

// 표본 부족 시 낮게
export const calcConfidence = (mentionPosts: number, mentionUsers: number) => {
  const p = clamp(mentionPosts / 20, 0, 1);
  const u = clamp(mentionUsers / 20, 0, 1);
  const base = 0.15 + 0.85 * Math.sqrt(p * u);
  return clamp(base, 0, 1);
};

export async function groqChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature = 0.2,
  maxTokens = 1200,
) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Groq non-OK: ${resp.status} ${t}`);
  }
  return await resp.json();
}

export async function groqClassifyBatch(
  apiKey: string,
  model: string,
  items: { raw_norm: string; raw_text_example: string }[],
): Promise<Record<string, { group: GroupKey; concept_key: string; label: string; confidence: number }>> {
  const system = `
You are a strict JSON generator.
Classify each hashtag (already normalized) into one of:
atmosphere, purpose, menu, seating, amenity, category.
Return a JSON object: { "<raw_norm>": { "group": "...", "concept_key": "...", "label": "...", "confidence": 0..1 } }

Rules:
- concept_key: snake_case, short, stable.
- label: human readable (use natural language of the example).
- If uncertain, set group "category" and confidence <= 0.4.
- No extra keys; no extra text outside JSON.
`.trim();

  const user = `
Items:
${items.map((it) => `- raw_norm: "${it.raw_norm}", example: "${it.raw_text_example}"`).join("\n")}
`.trim();

  const data = await groqChat(
    apiKey,
    model,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    0.2,
    1200,
  );

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Groq classify: empty content");

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}$/);
    if (!m) throw new Error("Groq classify returned non-JSON");
    parsed = JSON.parse(m[0]);
  }

  const out: Record<string, { group: GroupKey; concept_key: string; label: string; confidence: number }> = {};
  const valid: GroupKey[] = ["atmosphere", "purpose", "menu", "seating", "amenity", "category"];

  for (const [k, v] of Object.entries(parsed)) {
    const group = (v as any)?.group as GroupKey;
    const concept_key = String((v as any)?.concept_key ?? "").trim();
    const label = String((v as any)?.label ?? "").trim();
    const confidence = Number((v as any)?.confidence ?? 0.3);

    out[String(k)] = {
      group: valid.includes(group) ? group : "category",
      concept_key: concept_key || String(k),
      label: label || String(k),
      confidence: clamp(isFinite(confidence) ? confidence : 0.3, 0, 1),
    };
  }
  return out;
}

export function buildFactsFromBusiness(biz: BusinessRow | null, menuItems: BusinessMenuItem[]) {
  const facts: ProfileJsonV1["facts"] = {
    name: biz?.name ?? null,
    address: biz?.address ?? null,
    one_line_intro: biz?.one_line_intro ?? null,
    description: biz?.description ?? null,
    category_major: (biz as any)?.category_major ?? null,
    category_minor: (biz as any)?.category_minor ?? null,
    facilities: (biz as any)?.facilities ?? null,
    menu_highlights: [],
  };

  const sorted = [...menuItems].sort((a, b) => {
    const as = a.is_signature ? 0 : 1;
    const bs = b.is_signature ? 0 : 1;
    if (as !== bs) return as - bs;
    const ao = a.sort_order ?? 9999;
    const bo = b.sort_order ?? 9999;
    if (ao !== bo) return ao - bo;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });

  for (const it of sorted.slice(0, 8)) {
    if (!it.name) continue;
    (facts.menu_highlights as any).push({
      name: it.name,
      price: typeof it.price === "number" ? it.price : null,
      is_signature: it.is_signature ?? null,
    });
  }

  return facts;
}

export function createAdminClient() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}
