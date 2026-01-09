// supabase/functions/business-profile/index.ts
// DROP-IN: posts + post_comments + post_tags + businesses(shop_id)
//
// Profile rules:
// - rate = users / denom.users (users-based)
// - category top3
// - allowed keys from ai_concepts only
// - saves to business_ai_profiles via upsert (business_id, window_days)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type GroupKey = "category" | "vibe" | "purpose" | "amenity" | "menu" | "seating";

type EvidenceV1 = {
  source: "post_tag" | "caption" | "comment" | "business_desc";
  ref_id?: string;
  text?: string;
};

type AiSignalV1 = {
  key: string;
  rate: number; // users / denom.users
  users: number;
  posts: number;
  evidence: EvidenceV1[];
};

type GroupProfileV1 = {
  denom: { posts: number; users: number };
  signals: AiSignalV1[];
  notes?: string;
};

type BizProfileV1 = {
  version: "biz_profile_v1";
  window: { days: number; start_at: string; end_at: string };
  coverage: {
    posts_total: number;
    users_total: number;
    sources: { post_tags: number; captions: number; comments: number; business_desc: number };
  };
  groups: Record<GroupKey, GroupProfileV1>;
  confidence: {
    overall: number;
    by_group: Record<GroupKey, number>;
  };
  updated_at: string;
};

type BizProfileBuildRequest = {
  business_id: string; // uuid
  window_days?: number; // default 7
  locale?: "ko" | "en";
  force?: boolean;
  max_signals_per_group?: number; // default 12 (category forced to 3)
  max_evidence_per_signal?: number; // default 3
};

type BizProfileBuildResponse = {
  ok: true;
  business_id: string;
  window_days: number;
  computed_at: string;
  briefing: string | null;
  profile: BizProfileV1;
  stored: { profile_row_id: string; upserted: boolean };
  warnings?: Array<{ code: string; message: string }>;
};

type BizProfileBuildErrorResponse = {
  ok: false;
  error: {
    code: "BAD_REQUEST" | "UNAUTHORIZED" | "DB_FAILED" | "AI_FAILED" | "INTERNAL";
    message: string;
    detail?: unknown;
  };
};

const DATA = {
  businesses: {
    table: "businesses",
    id: "id",
    shop_id: "shop_id",
  },
  posts: {
    table: "posts",
    id: "id",
    user_id: "user_id",
    created_at: "created_at",
    deleted_at: "deleted_at",
    caption: "caption",
    business_id: "business_id",
    business_name: "business_name", // optional
  },
  comments: {
    enabled: true,
    table: "post_comments",
    id: "id",
    post_id: "post_id",
    user_id: "user_id",
    created_at: "created_at",
    deleted_at: "deleted_at",
    body: "body",
  },
  post_tags: {
    enabled: true,
    table: "post_tags",
    id: "id",
    post_id: "post_id",
    user_id: "user_id",
    created_at: "created_at",
    deleted_at: "deleted_at",
    tag_text: "tag_text",
  },
} as const;

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_MAX_SIGNALS = 12;
const DEFAULT_MAX_EVIDENCE = 3;

const MAX_POSTS_FETCH = 250;
const MAX_COMMENTS_FETCH = 600;
const MAX_TAGS_FETCH = 1200;

const MAX_TEXT_LEN = 180;
const MAX_TAG_LEN = 60;
const MAX_TAGS_PER_POST = 20;

const PROFILE_VERSION: BizProfileV1["version"] = "biz_profile_v1";

function json<T>(body: T, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toIso(d: Date) {
  return d.toISOString();
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function truncateText(s: unknown, maxLen = MAX_TEXT_LEN): string {
  const t = (typeof s === "string" ? s : "").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}

function normalizeTagText(s: unknown): string | null {
  const t = (typeof s === "string" ? s : "").trim();
  if (!t) return null;
  const clean = t.startsWith("#") ? t.slice(1).trim() : t;
  if (!clean) return null;
  return clean.length > MAX_TAG_LEN ? clean.slice(0, MAX_TAG_LEN) : clean;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

// -----------------------------
// AI (OpenAI-compatible chat.completions)
// -----------------------------
type AiMapOutput = {
  events: Array<{
    group: GroupKey;
    key: string;
    user_id?: string;
    post_id?: string;
    comment_id?: string;
    source: "post_tag" | "caption" | "comment" | "business_desc";
    evidence_text?: string;
  }>;
};

async function aiChatJSON(args: { system: string; user: string; temperature?: number }): Promise<any> {
  const baseUrl = Deno.env.get("AI_BASE_URL") ?? "";
  const apiKey = Deno.env.get("AI_API_KEY") ?? "";
  const model = Deno.env.get("AI_MODEL") ?? "";
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Missing AI_BASE_URL / AI_API_KEY / AI_MODEL env");
  }

  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: args.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`AI HTTP ${resp.status}: ${t}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI returned empty content");
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("AI returned non-JSON content");
  }
}

async function aiMapToConcepts(params: {
  allowedByGroup: Record<GroupKey, string[]>;
  locale: "ko" | "en";
  business: { name: string | null; description: string | null };
  posts: Array<{ id: string; user_id: string; caption: string; created_at: string; tags: string[] }>;
  comments: Array<{ id: string; post_id: string; user_id: string; body: string; created_at: string }>;
}): Promise<AiMapOutput> {
  const allowedCompact = (g: GroupKey) => params.allowedByGroup[g].join(", ");

  const system = [
    "You are a classifier for a place profiling engine.",
    "You MUST ONLY choose keys that appear in the provided allowed lists per group.",
    "Output STRICT JSON with shape: { events: [...] }.",
    "Each event is one mention of a concept key from a specific source.",
    "Group keys: category, vibe, purpose, amenity, menu, seating.",
    "If nothing matches, return events: [].",
    "Do NOT invent keys. Do NOT invent groups.",
  ].join("\n");

  const postInputs = params.posts.map((p) => ({
    post_id: p.id,
    user_id: p.user_id,
    tags: p.tags.slice(0, MAX_TAGS_PER_POST),
    caption: truncateText(p.caption),
  }));

  const commentInputs = params.comments.map((c) => ({
    comment_id: c.id,
    post_id: c.post_id,
    user_id: c.user_id,
    body: truncateText(c.body),
  }));

  const user = JSON.stringify({
    locale: params.locale,
    business: {
      name: params.business.name,
      description: params.business.description ? truncateText(params.business.description, 220) : null,
    },
    allowed_keys: {
      category: allowedCompact("category"),
      vibe: allowedCompact("vibe"),
      purpose: allowedCompact("purpose"),
      amenity: allowedCompact("amenity"),
      menu: allowedCompact("menu"),
      seating: allowedCompact("seating"),
    },
    inputs: { posts: postInputs, comments: commentInputs },
    instruction: {
      priority: [
        "Use post.tags as the strongest signals when present.",
        "Use caption and comment bodies as additional signals.",
        "Category should reflect what the place is (cafe/bar/restaurant/cuisine).",
        "Emit events with source 'post_tag' when derived from tags; 'caption' for captions; 'comment' for comments.",
      ],
      evidence_rule: "evidence_text should be a short phrase (<=120 chars) copied or summarized from the input (for tags, use the tag itself).",
    },
    output_schema_example: {
      events: [
        { group: "purpose", key: "work_friendly", user_id: "uuid", post_id: "post_uuid", source: "post_tag", evidence_text: "work" },
        { group: "vibe", key: "quiet", user_id: "uuid", post_id: "post_uuid", source: "caption", evidence_text: "조용해서 대화하기 좋음" },
      ],
    },
  });

  const out = await aiChatJSON({ system, user, temperature: 0.15 });
  const events = Array.isArray(out?.events) ? out.events : [];
  return { events };
}

async function aiRenderBriefing(params: {
  locale: "ko" | "en";
  businessName: string | null;
  profile: BizProfileV1;
}): Promise<string | null> {
  const system = [
    "You write a concise business briefing for a place profile.",
    "Use a professional, neutral tone.",
    "Do NOT mention internal terms like denom, rate, keys.",
    "Keep it short (2-3 sentences).",
    "Output JSON: { briefing: string|null }.",
  ].join("\n");

  const top = (g: GroupKey, n: number) =>
    (params.profile.groups[g]?.signals ?? []).slice(0, n).map((s) => ({ key: s.key, rate: s.rate, users: s.users }));

  const user = JSON.stringify({
    locale: params.locale,
    business_name: params.businessName,
    window_days: params.profile.window.days,
    highlights: {
      category_top3: top("category", 3),
      vibe_top3: top("vibe", 3),
      purpose_top3: top("purpose", 3),
      amenity_top3: top("amenity", 3),
      menu_top3: top("menu", 3),
      seating_top3: top("seating", 3),
    },
    confidence_overall: params.profile.confidence.overall,
  });

  try {
    const out = await aiChatJSON({ system, user, temperature: 0.25 });
    const briefing = typeof out?.briefing === "string" ? out.briefing.trim() : "";
    return briefing ? briefing : null;
  } catch {
    return null;
  }
}

// -----------------------------
// Aggregation (users-based, category top3)
// -----------------------------
type MentionEvent = {
  group: GroupKey;
  key: string;
  user_id?: string;
  post_id?: string;
  comment_id?: string;
  source: EvidenceV1["source"];
  evidence_text?: string;
};

function aggregateProfile(args: {
  allowedByGroup: Record<GroupKey, Set<string>>;
  window: { days: number; startAt: Date; endAt: Date };
  coverage: {
    postsTotal: number;
    usersTotal: number;
    sources: { post_tags: number; captions: number; comments: number; business_desc: number };
  };
  events: MentionEvent[];
  maxSignals: number;
  maxEvidence: number;
}): { profile: BizProfileV1; warnings: Array<{ code: string; message: string }> } {
  const warnings: Array<{ code: string; message: string }> = [];
  const groups: GroupKey[] = ["category", "vibe", "purpose", "amenity", "menu", "seating"];

  const denomUsers = new Map<GroupKey, Set<string>>();
  const denomPosts = new Map<GroupKey, Set<string>>();
  for (const g of groups) {
    denomUsers.set(g, new Set());
    denomPosts.set(g, new Set());
  }

  const perGroupKey = new Map<string, { users: Set<string>; posts: Set<string>; evidence: EvidenceV1[] }>();

  const filtered: MentionEvent[] = [];
  for (const e of args.events) {
    if (!groups.includes(e.group)) continue;
    if (!args.allowedByGroup[e.group]?.has(e.key)) continue;
    filtered.push(e);
  }

  for (const e of filtered) {
    if (e.user_id) denomUsers.get(e.group)!.add(e.user_id);
    if (e.post_id) denomPosts.get(e.group)!.add(e.post_id);

    const mapKey = `${e.group}::${e.key}`;
    const cur = perGroupKey.get(mapKey) ?? { users: new Set(), posts: new Set(), evidence: [] };

    if (e.user_id) cur.users.add(e.user_id);
    if (e.post_id) cur.posts.add(e.post_id);

    if (args.maxEvidence > 0) {
      const ev: EvidenceV1 = {
        source: e.source,
        ref_id: e.comment_id ?? e.post_id,
        text: truncateText(e.evidence_text, 120) || undefined,
      };
      const sig = `${ev.source}::${ev.ref_id ?? ""}::${ev.text ?? ""}`;
      const already = cur.evidence.some((x) => `${x.source}::${x.ref_id ?? ""}::${x.text ?? ""}` === sig);
      if (!already && cur.evidence.length < args.maxEvidence) cur.evidence.push(ev);
    }

    perGroupKey.set(mapKey, cur);
  }

  const groupProfiles: Record<GroupKey, GroupProfileV1> = {
    category: { denom: { posts: 0, users: 0 }, signals: [] },
    vibe: { denom: { posts: 0, users: 0 }, signals: [] },
    purpose: { denom: { posts: 0, users: 0 }, signals: [] },
    amenity: { denom: { posts: 0, users: 0 }, signals: [] },
    menu: { denom: { posts: 0, users: 0 }, signals: [] },
    seating: { denom: { posts: 0, users: 0 }, signals: [] },
  };

  for (const g of groups) {
    const du = denomUsers.get(g)!.size;
    const dp = denomPosts.get(g)!.size;
    groupProfiles[g].denom = { posts: dp, users: du };

    const signals: AiSignalV1[] = [];
    for (const [k, v] of perGroupKey.entries()) {
      const [gg, key] = k.split("::") as [GroupKey, string];
      if (gg !== g) continue;

      const users = v.users.size;
      const posts = v.posts.size;
      const rate = du > 0 ? clamp01(users / du) : 0;

      signals.push({
        key,
        rate,
        users,
        posts,
        evidence: v.evidence.slice(0, args.maxEvidence),
      });
    }

    signals.sort((a, b) => (b.rate - a.rate) || (b.users - a.users) || (b.posts - a.posts));

    const limit = g === "category" ? 3 : args.maxSignals;
    groupProfiles[g].signals = signals.slice(0, Math.max(0, limit));
  }

  const byGroup: Record<GroupKey, number> = { category: 0, vibe: 0, purpose: 0, amenity: 0, menu: 0, seating: 0 };

  function groupConf(g: GroupKey) {
    const du = groupProfiles[g].denom.users;
    const dp = groupProfiles[g].denom.posts;
    const u = clamp01(du / 8);
    const p = clamp01(dp / 15);
    return clamp01(u * 0.65 + p * 0.35);
  }

  let sum = 0;
  let wsum = 0;
  for (const g of groups) {
    byGroup[g] = groupConf(g);
    const w = Math.max(1, groupProfiles[g].denom.users);
    sum += byGroup[g] * w;
    wsum += w;
  }
  const overall = wsum > 0 ? clamp01(sum / wsum) : 0;

  if (args.coverage.postsTotal < 3 || args.coverage.usersTotal < 3) {
    warnings.push({ code: "LOW_SAMPLE", message: "최근 데이터 표본이 적어 신뢰도가 낮을 수 있습니다." });
  }

  const computedAtIso = toIso(new Date());
  const profile: BizProfileV1 = {
    version: PROFILE_VERSION,
    window: { days: args.window.days, start_at: toIso(args.window.startAt), end_at: toIso(args.window.endAt) },
    coverage: { posts_total: args.coverage.postsTotal, users_total: args.coverage.usersTotal, sources: args.coverage.sources },
    groups: groupProfiles,
    confidence: { overall, by_group: byGroup },
    updated_at: computedAtIso,
  };

  return { profile, warnings };
}

// -----------------------------
// Handler
// -----------------------------
serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json<BizProfileBuildErrorResponse>({ ok: false, error: { code: "BAD_REQUEST", message: "POST only" } }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return json<BizProfileBuildErrorResponse>(
        { ok: false, error: { code: "INTERNAL", message: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" } },
        500,
      );
    }

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = (await req.json().catch(() => null)) as BizProfileBuildRequest | null;
    if (!body || typeof body !== "object") {
      return json<BizProfileBuildErrorResponse>({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }, 400);
    }

    const businessId = String(body.business_id ?? "").trim();
    if (!businessId || !isUuid(businessId)) {
      return json<BizProfileBuildErrorResponse>(
        { ok: false, error: { code: "BAD_REQUEST", message: "business_id must be a uuid" } },
        400,
      );
    }

    const windowDays = Math.max(1, Math.min(30, Number(body.window_days ?? DEFAULT_WINDOW_DAYS)));
    const locale: "ko" | "en" = body.locale === "en" ? "en" : "ko";
    const force = Boolean(body.force ?? false);

    const maxSignals = Math.max(5, Math.min(20, Number(body.max_signals_per_group ?? DEFAULT_MAX_SIGNALS)));
    const maxEvidence = Math.max(0, Math.min(5, Number(body.max_evidence_per_signal ?? DEFAULT_MAX_EVIDENCE)));

    // cache reuse: 6 hours
    if (!force) {
      const { data: cached, error: cErr } = await sb
        .from("business_ai_profiles")
        .select("id, computed_at, profile_json, briefing, window_days")
        .eq("business_id", businessId)
        .eq("window_days", windowDays)
        .maybeSingle();

      if (!cErr && cached?.profile_json) {
        const computedAt = new Date(cached.computed_at);
        const ageMs = Date.now() - computedAt.getTime();
        if (ageMs >= 0 && ageMs < 6 * 60 * 60 * 1000) {
          const profile = cached.profile_json as BizProfileV1;
          const res: BizProfileBuildResponse = {
            ok: true,
            business_id: businessId,
            window_days: windowDays,
            computed_at: computedAt.toISOString(),
            briefing: cached.briefing ?? null,
            profile,
            stored: { profile_row_id: String(cached.id), upserted: false },
          };
          return json(res, 200);
        }
      }
    }

    // allowed keys
    const { data: conceptRows, error: aErr } = await sb
      .from("ai_concepts")
      .select("group, concept_key, is_active")
      .eq("is_active", true);

    if (aErr) {
      return json<BizProfileBuildErrorResponse>(
        { ok: false, error: { code: "DB_FAILED", message: "Failed to load ai_concepts", detail: aErr } },
        500,
      );
    }

    const allowedArr: Record<GroupKey, string[]> = { category: [], vibe: [], purpose: [], amenity: [], menu: [], seating: [] };
    const allowedSet: Record<GroupKey, Set<string>> = { category: new Set(), vibe: new Set(), purpose: new Set(), amenity: new Set(), menu: new Set(), seating: new Set() };

    for (const r of conceptRows ?? []) {
      const g = r.group as GroupKey;
      const k = String(r.concept_key ?? "");
      if (!k || !(g in allowedArr)) continue;
      allowedArr[g].push(k);
      allowedSet[g].add(k);
    }

    // business name (shop_id)
    const { data: biz, error: bErr } = await sb
      .from(DATA.businesses.table)
      .select(`${DATA.businesses.id}, ${DATA.businesses.shop_id}`)
      .eq(DATA.businesses.id, businessId)
      .maybeSingle();

    if (bErr) {
      return json<BizProfileBuildErrorResponse>(
        { ok: false, error: { code: "DB_FAILED", message: "Failed to load business", detail: bErr } },
        500,
      );
    }

    const businessName: string | null = biz?.[DATA.businesses.shop_id] ? String(biz[DATA.businesses.shop_id]) : null;
    const businessDesc: string | null = null;

    // window
    const endAt = new Date();
    const startAt = new Date(endAt.getTime() - windowDays * 24 * 60 * 60 * 1000);

    // posts
    const { data: postsRaw, error: pErr } = await sb
      .from(DATA.posts.table)
      .select(`${DATA.posts.id}, ${DATA.posts.user_id}, ${DATA.posts.created_at}, ${DATA.posts.caption}, ${DATA.posts.deleted_at}`)
      .eq(DATA.posts.business_id, businessId)
      .is(DATA.posts.deleted_at, null)
      .gte(DATA.posts.created_at, startAt.toISOString())
      .lte(DATA.posts.created_at, endAt.toISOString())
      .order(DATA.posts.created_at, { ascending: false })
      .limit(MAX_POSTS_FETCH);

    if (pErr) {
      return json<BizProfileBuildErrorResponse>(
        { ok: false, error: { code: "DB_FAILED", message: "Failed to load posts", detail: pErr } },
        500,
      );
    }

    const postsBase = (postsRaw ?? [])
      .map((r: any) => ({
        id: String(r?.[DATA.posts.id]),
        user_id: String(r?.[DATA.posts.user_id]),
        created_at: String(r?.[DATA.posts.created_at]),
        caption: String(r?.[DATA.posts.caption] ?? ""),
      }))
      .filter((p: any) => p.id && p.user_id);

    const postsTotal = postsBase.length;
    const usersTotal = uniq(postsBase.map((p) => p.user_id)).length;

    // comments
    let comments: Array<{ id: string; post_id: string; user_id: string; body: string; created_at: string }> = [];
    if (DATA.comments.enabled && postsBase.length > 0) {
      const postIds = postsBase.map((p) => p.id);
      const batches: string[][] = [];
      for (let i = 0; i < postIds.length; i += 100) batches.push(postIds.slice(i, i + 100));

      for (const batch of batches) {
        const { data: cRaw, error: cErr } = await sb
          .from(DATA.comments.table)
          .select(`${DATA.comments.id}, ${DATA.comments.post_id}, ${DATA.comments.user_id}, ${DATA.comments.created_at}, ${DATA.comments.body}, ${DATA.comments.deleted_at}`)
          .in(DATA.comments.post_id, batch)
          .is(DATA.comments.deleted_at, null)
          .gte(DATA.comments.created_at, startAt.toISOString())
          .lte(DATA.comments.created_at, endAt.toISOString())
          .order(DATA.comments.created_at, { ascending: false })
          .limit(Math.ceil(MAX_COMMENTS_FETCH / Math.max(1, batches.length)));

        if (cErr) {
          comments = [];
          break;
        }

        for (const r of cRaw ?? []) {
          comments.push({
            id: String(r?.[DATA.comments.id]),
            post_id: String(r?.[DATA.comments.post_id]),
            user_id: String(r?.[DATA.comments.user_id]),
            created_at: String(r?.[DATA.comments.created_at]),
            body: String(r?.[DATA.comments.body] ?? ""),
          });
        }
      }

      comments = comments.slice(0, MAX_COMMENTS_FETCH);
    }

    // post_tags
    const tagsByPostId = new Map<string, string[]>();
    if (DATA.post_tags.enabled && postsBase.length > 0) {
      const postIds = postsBase.map((p) => p.id);
      const batches: string[][] = [];
      for (let i = 0; i < postIds.length; i += 100) batches.push(postIds.slice(i, i + 100));

      let fetched = 0;

      for (const batch of batches) {
        if (fetched >= MAX_TAGS_FETCH) break;

        const { data: tRaw, error: tErr } = await sb
          .from(DATA.post_tags.table)
          .select(`${DATA.post_tags.id}, ${DATA.post_tags.post_id}, ${DATA.post_tags.user_id}, ${DATA.post_tags.tag_text}, ${DATA.post_tags.created_at}, ${DATA.post_tags.deleted_at}`)
          .in(DATA.post_tags.post_id, batch)
          .is(DATA.post_tags.deleted_at, null)
          .gte(DATA.post_tags.created_at, startAt.toISOString())
          .lte(DATA.post_tags.created_at, endAt.toISOString())
          .order(DATA.post_tags.created_at, { ascending: false })
          .limit(Math.ceil(MAX_TAGS_FETCH / Math.max(1, batches.length)));

        if (tErr) {
          // 태그는 선택 소스이므로 실패해도 계속 진행(캡션/댓글로)
          break;
        }

        for (const r of tRaw ?? []) {
          if (fetched >= MAX_TAGS_FETCH) break;
          fetched++;

          const postId = String(r?.[DATA.post_tags.post_id] ?? "");
          const tagText = normalizeTagText(r?.[DATA.post_tags.tag_text]);
          if (!postId || !tagText) continue;

          const cur = tagsByPostId.get(postId) ?? [];
          if (!cur.includes(tagText)) cur.push(tagText);
          tagsByPostId.set(postId, cur.slice(0, MAX_TAGS_PER_POST));
        }
      }
    }

    // merge posts with tags
    const posts = postsBase.map((p) => ({
      ...p,
      tags: tagsByPostId.get(p.id) ?? [],
    }));

    const sourcesCount = {
      post_tags: posts.filter((p) => p.tags.length > 0).length,
      captions: posts.filter((p) => String(p.caption ?? "").trim().length > 0).length,
      comments: comments.length,
      business_desc: 0,
    };

    // AI mapping
    let mapOut: AiMapOutput;
    try {
      mapOut = await aiMapToConcepts({
        allowedByGroup: allowedArr,
        locale,
        business: { name: businessName, description: businessDesc },
        posts,
        comments,
      });
    } catch (e) {
      return json<BizProfileBuildErrorResponse>(
        { ok: false, error: { code: "AI_FAILED", message: "AI mapping failed", detail: String((e as any)?.message ?? e) } },
        500,
      );
    }

    const events: MentionEvent[] = (mapOut?.events ?? []).map((x: any) => ({
      group: x.group,
      key: String(x.key ?? ""),
      user_id: x.user_id ? String(x.user_id) : undefined,
      post_id: x.post_id ? String(x.post_id) : undefined,
      comment_id: x.comment_id ? String(x.comment_id) : undefined,
      source: x.source,
      evidence_text: typeof x.evidence_text === "string" ? x.evidence_text : undefined,
    }));

    const { profile, warnings } = aggregateProfile({
      allowedByGroup: allowedSet,
      window: { days: windowDays, startAt, endAt },
      coverage: { postsTotal, usersTotal, sources: sourcesCount },
      events,
      maxSignals,
      maxEvidence,
    });

    const briefing = await aiRenderBriefing({ locale, businessName, profile });

    // save upsert
    const vendor = Deno.env.get("AI_VENDOR") ?? null;
    const modelName = Deno.env.get("AI_MODEL") ?? null;
    const promptVersion = Deno.env.get("PROFILE_PROMPT_VERSION") ?? PROFILE_VERSION;

    const upsertPayload = {
      business_id: businessId,
      window_days: windowDays,
      computed_at: new Date().toISOString(),
      model_vendor: vendor,
      model_name: modelName,
      prompt_version: promptVersion,
      confidence: profile.confidence.overall,
      profile_json: profile,
      briefing: briefing,
      source_counts: {
        posts_total: postsTotal,
        users_total: usersTotal,
        sources: sourcesCount,
      },
    };

    const { data: saved, error: sErr } = await sb
      .from("business_ai_profiles")
      .upsert(upsertPayload, { onConflict: "business_id,window_days" })
      .select("id")
      .maybeSingle();

    if (sErr) {
      return json<BizProfileBuildErrorResponse>(
        { ok: false, error: { code: "DB_FAILED", message: "Failed to upsert business_ai_profiles", detail: sErr } },
        500,
      );
    }

    const res: BizProfileBuildResponse = {
      ok: true,
      business_id: businessId,
      window_days: windowDays,
      computed_at: profile.updated_at,
      briefing,
      profile,
      stored: { profile_row_id: String(saved?.id ?? ""), upserted: true },
      warnings: warnings.length ? warnings : undefined,
    };

    return json(res, 200);
  } catch (e) {
    return json<BizProfileBuildErrorResponse>(
      { ok: false, error: { code: "INTERNAL", message: "Unhandled error", detail: String((e as any)?.message ?? e) } },
      500,
    );
  }
});
