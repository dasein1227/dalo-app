// supabase/functions/ai-profile-refresh/index.ts
// Service batch (daily) profile refresh.
// - Reads posts + post_tags for recent window_days (default 7)
// - Canonicalizes via ai_concept_aliases cache; classifies missing via Groq (optional)
// - Produces profile_json (facts + perception) and saves to businesses.profile_json
// - Saves ai_category_top3 as concept_key[] (Top3 only)
//
// Input:
// - { business_id } OR { businessId } (optional; if omitted, refreshes recently-active businesses)
// - window_days?: number (default 7)
// - limit_per_group?: number (default 30; category fixed Top3)
// - only_if_stale_minutes?: number (default 720 = 12h) : skip if profile_updated_at within this window
// - max_businesses?: number (default 200) when business_id omitted
// - dry_run?: boolean
//
// Output: { ok, refreshed[], skipped[], errors[] }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  AliasRow,
  BusinessMenu,
  BusinessMenuItem,
  BusinessRow,
  ConceptSignal,
  GroupKey,
  ProfileJsonV1,
  TagRow,
  PostRow,
  buildFactsFromBusiness,
  calcConfidence,
  clamp,
  createAdminClient,
  daysAgoIso,
  detectLang,
  groqClassifyBatch,
  json,
  nowIso,
  uniq,
} from "../_shared/ai_profile_shared.ts";

type ReqBody = {
  businessId?: string;
  business_id?: string;
  window_days?: number;
  limit_per_group?: number;
  only_if_stale_minutes?: number;
  max_businesses?: number;
  dry_run?: boolean;
};

type RefreshResult = {
  business_id: string;
  posts_total: number;
  tags_total: number;
  category_top3: string[];
  saved: boolean;
};

async function buildProfileForBusiness(params: {
  admin: any;
  businessId: string;
  windowDays: number;
  limitPerGroup: number;
  GROQ_API_KEY: string;
  GROQ_MODEL: string;
}): Promise<{ profile: ProfileJsonV1; categoryTop3: string[]; postsTotal: number; tagsTotal: number }> {
  const { admin, businessId, windowDays, limitPerGroup, GROQ_API_KEY, GROQ_MODEL } = params;

  const sinceIso = daysAgoIso(windowDays);
  const now = nowIso();

  // facts
  const bizRes = await admin
    .from("businesses")
    .select("id,name,address,one_line_intro,description,category_major,category_minor,facilities,logo_image_url,main_image_url,hero_image_url")
    .eq("id", businessId)
    .maybeSingle();
  const biz: BusinessRow | null = (bizRes.data as any) ?? null;

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

  // posts
  const postsRes = await admin
    .from("posts")
    .select("id,user_id,created_at")
    .eq("business_id", businessId)
    .gte("created_at", sinceIso);

  const posts = (postsRes.data ?? []) as PostRow[];
  const postIds = posts.map((p) => p.id);

  // tags
  let tags: TagRow[] = [];
  if (postIds.length > 0) {
    const tagsRes = await admin
      .from("post_tags")
      .select("post_id,user_id,tag_text,tag_norm,created_at")
      .in("post_id", postIds)
      .is("deleted_at", null)
      .gte("created_at", sinceIso);
    tags = (tagsRes.data ?? []) as TagRow[];
  }

  const uniqueUsersTotal = uniq(posts.map((p) => p.user_id)).length;

  // alias cache
  const norms = uniq(tags.map((t) => t.tag_norm).filter(Boolean));
  const aliasRes = norms.length
    ? await admin
        .from("ai_concept_aliases")
        .select("raw_norm,group_key,concept_key,label,status,confidence,evidence")
        .in("raw_norm", norms)
    : { data: [], error: null as any };

  const aliasMap = new Map<string, AliasRow>();
  if (!aliasRes.error && aliasRes.data) {
    for (const r of aliasRes.data as any[]) aliasMap.set(String(r.raw_norm), r as AliasRow);
  }

  const exampleByNorm = new Map<string, string>();
  for (const t of tags) if (!exampleByNorm.has(t.tag_norm)) exampleByNorm.set(t.tag_norm, t.tag_text);

  // classify missing via Groq (optional)
  const need = norms
    .filter((n) => {
      const a = aliasMap.get(n);
      return !a;
    })
    .slice(0, 120);

  if (need.length > 0) {
    if (!GROQ_API_KEY) {
      // fallback: category
      for (const n of need) {
        const label = exampleByNorm.get(n) ?? n;
        aliasMap.set(n, {
          raw_norm: n,
          group_key: "category",
          concept_key: n,
          label,
          status: "approved",
          confidence: 0.25,
          evidence: [label],
        });
      }
    } else {
      const batch = need.map((n) => ({ raw_norm: n, raw_text_example: exampleByNorm.get(n) ?? n }));
      const classified = await groqClassifyBatch(GROQ_API_KEY, GROQ_MODEL, batch);

      const upRows = Object.entries(classified).map(([raw_norm, v]) => ({
        raw_norm,
        lang: detectLang(exampleByNorm.get(raw_norm) ?? raw_norm),
        group_key: v.group,
        concept_key: v.concept_key,
        label: v.label,
        status: "approved",
        confidence: v.confidence,
        evidence: [exampleByNorm.get(raw_norm) ?? raw_norm].filter(Boolean),
      }));

      // best-effort cache
      await admin.from("ai_concept_aliases").upsert(upRows, { onConflict: "raw_norm" }).catch(() => {});

      for (const row of upRows) {
        aliasMap.set(row.raw_norm, {
          raw_norm: row.raw_norm,
          group_key: row.group_key,
          concept_key: row.concept_key,
          label: row.label,
          status: "approved",
          confidence: row.confidence ?? null,
          evidence: (row as any).evidence ?? null,
        });
      }
    }
  }

  const groups: GroupKey[] = ["atmosphere", "purpose", "menu", "seating", "amenity", "category"];
  const bucket = new Map<GroupKey, Map<string, { label: string; users: Set<string>; posts: Set<string>; evidence: Set<string> }>>();
  const groupMentionPosts = new Map<GroupKey, Set<string>>();
  const groupMentionUsers = new Map<GroupKey, Set<string>>();
  const groupMentionTagsCount = new Map<GroupKey, number>();

  for (const g of groups) {
    bucket.set(g, new Map());
    groupMentionPosts.set(g, new Set());
    groupMentionUsers.set(g, new Set());
    groupMentionTagsCount.set(g, 0);
  }

  for (const t of tags) {
    const alias = aliasMap.get(t.tag_norm);
    if (!alias) continue;
    if (alias.status === "blocked") continue;

    const g = alias.group_key;
    const concept = alias.concept_key;

    groupMentionPosts.get(g)!.add(t.post_id);
    groupMentionUsers.get(g)!.add(t.user_id);
    groupMentionTagsCount.set(g, (groupMentionTagsCount.get(g) ?? 0) + 1);

    const m = bucket.get(g)!;
    if (!m.has(concept)) m.set(concept, { label: alias.label, users: new Set(), posts: new Set(), evidence: new Set() });

    const cell = m.get(concept)!;
    cell.users.add(t.user_id);
    cell.posts.add(t.post_id);

    if (cell.evidence.size < 5) cell.evidence.add(t.tag_text);
  }

  const groupSummaries: any = {};

  for (const g of groups) {
    const m = bucket.get(g)!;
    const mentionPosts = groupMentionPosts.get(g)!.size;
    const mentionUsers = groupMentionUsers.get(g)!.size;
    const mentionTags = groupMentionTagsCount.get(g) ?? 0;

    const entries = Array.from(m.entries()).map(([concept_key, v]) => ({
      concept_key,
      label: v.label,
      users: v.users.size,
      posts: v.posts.size,
      evidence: Array.from(v.evidence),
    }));

    entries.sort((a, b) => (b.users - a.users) || (b.posts - a.posts) || a.concept_key.localeCompare(b.concept_key));

    const topLimit = g === "category" ? 3 : limitPerGroup;
    const topN = entries.slice(0, topLimit);

    const denom = Math.max(1, mentionPosts);
    const topSignals: ConceptSignal[] = topN.map((e) => ({
      group: g,
      concept_key: e.concept_key,
      label: e.label,
      users: e.users,
      posts: e.posts,
      share: clamp(e.posts / denom, 0, 1),
      evidence: e.evidence,
    }));

    groupSummaries[g] = {
      group: g,
      top: topSignals,
      confidence: calcConfidence(mentionPosts, mentionUsers),
      stats: { mention_posts: mentionPosts, mention_users: mentionUsers, mention_tags: mentionTags },
    };
  }

  const categoryTop3 = (groupSummaries.category?.top ?? []).slice(0, 3).map((x: any) => x.concept_key);

  const profile: ProfileJsonV1 = {
    version: "biz_profile_v1",
    window_days: windowDays,
    generated_at: now,
    business_id: businessId,
    facts: buildFactsFromBusiness(biz, menuItems),
    sources: { posts_total: posts.length, tags_total: tags.length, unique_users_total: uniqueUsersTotal },
    groups: groupSummaries,
    category_top3: (groupSummaries.category?.top ?? []).slice(0, 3),
  };

  return { profile, categoryTop3, postsTotal: posts.length, tagsTotal: tags.length };
}

serve(async (req) => {
  if (req.method !== "POST") return json(405, { message: "POST만 지원합니다." });

  try {
    const admin = createAdminClient();
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
    const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.1-70b-versatile";

    const body = (await req.json().catch(() => null)) as ReqBody | null;

    const windowDays = clamp(Number(body?.window_days ?? 7), 1, 30);
    const limitPerGroup = clamp(Number(body?.limit_per_group ?? 30), 5, 50);
    const staleMinutes = clamp(Number(body?.only_if_stale_minutes ?? 720), 0, 43200);
    const maxBusinesses = clamp(Number(body?.max_businesses ?? 200), 1, 2000);
    const dryRun = !!body?.dry_run;

    const forcedBusinessId = body?.business_id ?? body?.businessId ?? null;

    let businessIds: string[] = [];

    if (forcedBusinessId) {
      businessIds = [forcedBusinessId];
    } else {
      const sinceIso = daysAgoIso(windowDays);
      const recent = await admin
        .from("posts")
        .select("business_id")
        .gte("created_at", sinceIso)
        .not("business_id", "is", null)
        .limit(maxBusinesses);

      const ids = (recent.data ?? []).map((r: any) => String(r.business_id)).filter(Boolean);
      businessIds = uniq(ids).slice(0, maxBusinesses);
    }

    const refreshed: RefreshResult[] = [];
    const skipped: string[] = [];
    const errors: Array<{ business_id: string; message: string }> = [];

    for (const businessId of businessIds) {
      if (staleMinutes > 0) {
        const chk = await admin
          .from("businesses")
          .select("id,profile_updated_at")
          .eq("id", businessId)
          .maybeSingle();

        const updatedAt = chk.data?.profile_updated_at ? new Date(chk.data.profile_updated_at).getTime() : 0;
        const cutoff = Date.now() - staleMinutes * 60 * 1000;
        if (updatedAt && updatedAt >= cutoff) {
          skipped.push(businessId);
          continue;
        }
      }

      try {
        const { profile, categoryTop3, postsTotal, tagsTotal } = await buildProfileForBusiness({
          admin,
          businessId,
          windowDays,
          limitPerGroup,
          GROQ_API_KEY,
          GROQ_MODEL,
        });

        if (!dryRun) {
          const upd = await admin
            .from("businesses")
            .update({
              profile_json: profile,
              profile_updated_at: profile.generated_at,
              profile_updated_by: null,
              ai_category_top3: categoryTop3,
            })
            .eq("id", businessId);

          if (upd.error) throw new Error(upd.error.message);
        }

        refreshed.push({
          business_id: businessId,
          posts_total: postsTotal,
          tags_total: tagsTotal,
          category_top3: categoryTop3,
          saved: !dryRun,
        });
      } catch (e: any) {
        errors.push({ business_id: businessId, message: e?.message ?? String(e) });
      }
    }

    return json(200, { ok: true, window_days: windowDays, refreshed, skipped, errors });
  } catch (err: any) {
    console.error("ai-profile-refresh fatal error", err);
    return json(500, { message: "AI 프로필 집계 중 서버 내부 오류", detail: err?.message ?? String(err) });
  }
});
