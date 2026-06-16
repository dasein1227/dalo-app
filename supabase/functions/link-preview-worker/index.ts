// supabase/functions/link-preview-worker/index.ts
// CO·ONN link preview worker - production robust version
// - Claims queued jobs from public.chat_link_preview_jobs
// - Fetches HTML with browser-like headers and multiple normalized URL candidates
// - Extracts OG/Twitter/meta/JSON-LD preview fields
// - Wraps images through Cloudflare thumbnail worker
// - Falls back to a safe generic preview for known hard-to-fetch domains
// - Broadcasts message_patch for realtime UI refresh

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("LINK_PREVIEW_WORKER_SECRET") || "";
const BROADCAST_URL = `${SUPABASE_URL}/realtime/v1/api/broadcast`;
const THUMB_BASE = Deno.env.get("COONN_THUMB_BASE") || "https://coonn-thumb.dasein1227.workers.dev";

const WORKER_ID = `chat-link-preview-worker-${crypto.randomUUID()}`;
const LOOP_BUDGET_MS = 55_000;
const CLAIM_BATCH_SIZE = 8;
const CLAIM_LEASE_SECONDS = 90;
const MAX_ATTEMPTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const FINAL_URL_TIMEOUT_MS = 7_000;
const HTML_MAX_BYTES = 1_200_000;
const LOG_PREFIX = "[link-preview-worker]";

function safeJson(input: unknown): string {
  return JSON.stringify(input, (_key, value) => {
    if (typeof value === "string" && value.length > 1000) {
      return `${value.slice(0, 1000)}…`;
    }
    return value;
  });
}

function log(event: string, data?: unknown) {
  if (data === undefined) {
    console.log(`${LOG_PREFIX} ${event}`);
    return;
  }
  console.log(`${LOG_PREFIX} ${event}`, safeJson(data));
}

function errorLog(event: string, data?: unknown) {
  if (data === undefined) {
    console.error(`${LOG_PREFIX} ${event}`);
    return;
  }
  console.error(`${LOG_PREFIX} ${event}`, safeJson(data));
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type LinkPreviewJob = {
  id: number;
  message_id: number;
  room_id: number;
  source_url: string;
  attempt_count: number;
  scheduled_at: string;
};

type LinkPreview = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
};

type FetchDetailedResult =
  | { kind: "ok"; finalUrl: string; html: string }
  | { kind: "none"; reason: string; finalUrl?: string }
  | { kind: "failed"; reason: string; finalUrl?: string };

type LinkPreviewResult =
  | { status: "ready"; preview: LinkPreview; source: "html" | "fallback" }
  | { status: "none"; reason: string; fallback?: LinkPreview }
  | { status: "failed"; reason: string; fallback?: LinkPreview };

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? req.headers.get("x-api-key") ?? "";
  const fnKey = req.headers.get("x-functions-key") ?? "";

  // Prefer a dedicated function secret in production. Keep service-role compatibility for manual ops.
  if (WORKER_SECRET && fnKey === WORKER_SECRET) return true;
  return auth === `Bearer ${SERVICE_ROLE_KEY}` || apikey === SERVICE_ROLE_KEY || fnKey === SERVICE_ROLE_KEY;
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeRetryDelaySeconds(attemptCount: number): number {
  const attempt = Math.max(1, attemptCount);
  return Math.min(1800, 30 * Math.pow(2, Math.max(0, attempt - 1)));
}

async function claimJobs(): Promise<LinkPreviewJob[]> {
  const { data, error } = await supabaseAdmin.rpc("chat_link_preview_jobs_claim", {
    p_worker_id: WORKER_ID,
    p_batch_size: CLAIM_BATCH_SIZE,
    p_lease_seconds: CLAIM_LEASE_SECONDS,
  });
  if (error) throw new Error(`chat_link_preview_jobs_claim failed: ${error.message}`);
  return Array.isArray(data) ? (data as LinkPreviewJob[]) : [];
}

async function markDone(jobId: number, status: "done" | "none" = "done") {
  const { error } = await supabaseAdmin.rpc("chat_link_preview_job_mark_done", {
    p_job_id: jobId,
    p_status: status,
  });
  if (error) throw new Error(`chat_link_preview_job_mark_done failed: ${error.message}`);
}

async function markRetry(jobId: number, delaySeconds: number, errorMessage: string) {
  const { error } = await supabaseAdmin.rpc("chat_link_preview_job_mark_retry", {
    p_job_id: jobId,
    p_delay_seconds: delaySeconds,
    p_error: errorMessage.slice(0, 1000),
  });
  if (error) throw new Error(`chat_link_preview_job_mark_retry failed: ${error.message}`);
}

async function markDead(jobId: number, errorMessage: string) {
  const { error } = await supabaseAdmin.rpc("chat_link_preview_job_mark_dead", {
    p_job_id: jobId,
    p_error: errorMessage.slice(0, 1000),
  });
  if (error) throw new Error(`chat_link_preview_job_mark_dead failed: ${error.message}`);
}

async function broadcast(roomId: number, event: string, payload: any): Promise<void> {
  await fetch(BROADCAST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ messages: [{ topic: `room:${roomId}`, event, payload }] }),
  }).catch(() => {});
}

function decodeHtmlEntities(input: string | null | undefined): string | null {
  if (!input) return null;
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function compactText(input: string | null | undefined, max = 220): string | null {
  const decoded = decodeHtmlEntities(input);
  if (!decoded) return null;
  const normalized = decoded.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function pickMetaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const safeKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${safeKey}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${safeKey}["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=${safeKey}[^>]*content=([^\s>]+)[^>]*>`, "i"),
    ];

    for (const re of patterns) {
      const m = html.match(re);
      const val = compactText(m?.[1] ?? null);
      if (val) return val;
    }
  }
  return null;
}

const pickTitle = (html: string): string | null => compactText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null, 160);

function resolveMaybeRelative(baseUrl: string, maybe: string | null): string | null {
  const s = (maybe ?? "").trim();
  if (!s) return null;
  try {
    return new URL(s, baseUrl).toString();
  } catch {
    return null;
  }
}

function pickJsonLdPreview(html: string, finalUrl: string): Partial<LinkPreview> {
  const result: Partial<LinkPreview> = {};
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const raw of scripts.slice(0, 6)) {
    const body = raw.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!body) continue;
    try {
      const parsed = JSON.parse(body);
      const candidates = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [])];
      for (const item of candidates) {
        if (!item || typeof item !== "object") continue;
        if (!result.title) result.title = compactText(item.name ?? item.headline ?? item.title ?? null, 160);
        if (!result.description) result.description = compactText(item.description ?? null, 260);
        if (!result.image) {
          const img = item.image;
          let imgUrl: string | null = null;
          if (typeof img === "string") imgUrl = img;
          else if (Array.isArray(img)) {
            const first = img.find(Boolean);
            imgUrl = typeof first === "string" ? first : first?.url ?? first?.contentUrl ?? null;
          } else if (img && typeof img === "object") imgUrl = img.url ?? img.contentUrl ?? null;
          result.image = resolveMaybeRelative(finalUrl, imgUrl);
        }
        if (!result.site_name && item.publisher && typeof item.publisher === "object") {
          result.site_name = compactText(item.publisher.name ?? null, 80);
        }
        if (result.title || result.description || result.image) return result;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return result;
}

function chromeLikeHeaders(url: string, isHtml: boolean): Record<string, string> {
  const accept = isHtml
    ? "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    : "image/avif,image/webp,image/apng,image/*,*/*;q=0.8";

  let origin = "https://www.google.com/";
  try {
    const u = new URL(url);
    origin = `${u.protocol}//${u.host}/`;
  } catch {}

  return {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    accept,
    "cache-control": "no-cache",
    pragma: "no-cache",
    "upgrade-insecure-requests": isHtml ? "1" : "0",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": isHtml ? "document" : "image",
    "sec-fetch-user": isHtml ? "?1" : "?0",
    referer: origin,
  };
}

function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    const dropExact = new Set([
      "NaPm", "site_preference", "gclid", "fbclid", "igshid", "mc_cid", "mc_eid",
      "spm", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    ]);
    for (const key of Array.from(u.searchParams.keys())) {
      if (dropExact.has(key) || key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function naverMobileize(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "blog.naver.com") u.hostname = "m.blog.naver.com";
    if (u.hostname === "place.naver.com") u.hostname = "m.place.naver.com";
    if (u.hostname === "news.naver.com") u.hostname = "m.news.naver.com";
    return u.toString();
  } catch {
    return url;
  }
}

function smartStoreCanonicalCandidates(url: string): string[] {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const m = u.pathname.match(/^\/([^/]+)\/products\/(\d+)/);
    if (!m || (!host.endsWith("smartstore.naver.com") && !host.endsWith("brand.naver.com"))) return [];
    const store = m[1];
    const productId = m[2];
    const stripped = stripTrackingParams(url);

    // Keep brand-store URLs as brand-store URLs. A brand.naver.com product page can
    // return different SSR/bootstrap state from smartstore.naver.com, and product
    // images are often present only in the brand route. Falling back to smartstore
    // variants is useful, but must not replace the original brand route first.
    if (host.endsWith("brand.naver.com")) {
      return [
        `https://brand.naver.com/${store}/products/${productId}`,
        `https://m.brand.naver.com/${store}/products/${productId}`,
        stripped,
        `https://smartstore.naver.com/${store}/products/${productId}`,
        `https://m.smartstore.naver.com/${store}/products/${productId}`,
      ];
    }

    return [
      `https://smartstore.naver.com/${store}/products/${productId}`,
      `https://m.smartstore.naver.com/${store}/products/${productId}`,
      stripped,
      `https://brand.naver.com/${store}/products/${productId}`,
      `https://m.brand.naver.com/${store}/products/${productId}`,
    ];
  } catch {
    return [];
  }
}

function buildFetchCandidates(sourceUrl: string): string[] {
  const out = new Set<string>();
  const add = (v: string | null | undefined) => {
    if (!v) return;
    try {
      const u = new URL(v);
      if (u.protocol === "http:" || u.protocol === "https:") out.add(u.toString());
    } catch {}
  };

  add(sourceUrl);
  add(stripTrackingParams(sourceUrl));
  add(naverMobileize(sourceUrl));
  for (const c of smartStoreCanonicalCandidates(sourceUrl)) add(c);
  return Array.from(out).slice(0, 8);
}

async function resolveFinalUrl(url: string, timeoutMs = FINAL_URL_TIMEOUT_MS, maxHops = 6): Promise<string> {
  let cur = url;

  for (let i = 0; i < maxHops; i += 1) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      let res = await fetch(cur, {
        method: "HEAD",
        redirect: "manual",
        signal: ac.signal,
        headers: chromeLikeHeaders(cur, false),
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (loc) {
          cur = new URL(loc, cur).toString();
          continue;
        }
      }

      if (res.status === 405 || res.status === 403 || res.status === 400 || res.status === 404) {
        res = await fetch(cur, {
          method: "GET",
          redirect: "manual",
          signal: ac.signal,
          headers: chromeLikeHeaders(cur, true),
        });

        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (loc) {
            cur = new URL(loc, cur).toString();
            continue;
          }
        }
      }

      return res.url || cur;
    } catch {
      return cur;
    } finally {
      clearTimeout(t);
    }
  }
  return cur;
}

const wrapImageThroughWorker = (imgUrl: string, referer: string) =>
  `${THUMB_BASE.endsWith("/") ? THUMB_BASE.slice(0, -1) : THUMB_BASE}/thumb?u=${encodeURIComponent(imgUrl)}&r=${encodeURIComponent(referer)}`;


function isSmartStoreUrl(url: string | null | undefined): boolean {
  try {
    const u = new URL(String(url ?? ""));
    const host = u.hostname.toLowerCase().replace(/^m\./, "");
    return host.endsWith("smartstore.naver.com") || host.endsWith("brand.naver.com");
  } catch {
    return false;
  }
}

function parseSmartStoreProductUrl(url: string | null | undefined): { store: string; productId: string; isBrand: boolean } | null {
  try {
    const u = new URL(String(url ?? ""));
    const host = u.hostname.toLowerCase();
    if (!host.endsWith("smartstore.naver.com") && !host.endsWith("brand.naver.com")) return null;
    const m = u.pathname.match(/^\/([^/]+)\/products\/(\d+)/);
    if (!m) return null;
    return { store: m[1], productId: m[2], isBrand: host.endsWith("brand.naver.com") };
  } catch {
    return null;
  }
}

function smartStoreReferer(url: string): string {
  const info = parseSmartStoreProductUrl(url);
  if (!info) return "https://m.smartstore.naver.com/";
  const host = info.isBrand ? "brand.naver.com" : "smartstore.naver.com";
  return `https://${host}/${info.store}`;
}

type FetchHeaderProfile = { label: string; headers: Record<string, string> };

function smartStoreHtmlHeaderProfiles(url: string): FetchHeaderProfile[] {
  const referer = smartStoreReferer(url);
  const mobileReferer = referer.replace("https://smartstore.naver.com/", "https://m.smartstore.naver.com/");
  const common = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "upgrade-insecure-requests": "1",
    "cache-control": "no-cache",
    pragma: "no-cache",
  } as const;

  // Do not impersonate Kakao/Naver/Facebook crawlers. Use realistic browser profiles
  // and a clear COONN crawler fallback. SmartStore may still throttle with 429; in
  // that case we prefer a safe text fallback over incorrect image scraping.
  return [
    {
      label: "mobile_chrome",
      headers: {
        ...common,
        "user-agent": "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        referer: mobileReferer,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
        "sec-fetch-user": "?1",
      },
    },
    {
      label: "desktop_chrome",
      headers: {
        ...common,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        referer,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
        "sec-fetch-user": "?1",
      },
    },
    {
      label: "coonn_bot",
      headers: {
        ...common,
        "user-agent": "COONN-LinkPreviewBot/1.0 (+https://coonn.app)",
        referer: "https://m.naver.com/",
      },
    },
  ];
}

function decodeJsLikeString(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = decodeHtmlEntities(input) ?? input;
  s = s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
  return s || null;
}

function cleanSmartStoreText(input: string | null | undefined, max = 180): string | null {
  const decoded = decodeJsLikeString(input);
  if (!decoded) return null;
  const text = compactText(decoded, max);
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower === "naver" || lower === "smartstore" || lower === "naver smartstore") return null;
  if (text === "네이버 스마트스토어" || text === "스마트스토어" || text === "NAVER SmartStore") return null;
  return text;
}

function collectJsonStringValuesByKeys(html: string, keys: string[], maxCandidates = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const safeKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const patterns = [
      new RegExp(`["']${safeKey}["']\\s*:\\s*["']((?:\\\\.|[^"'\\\\]){1,700})["']`, "gi"),
      new RegExp(`${safeKey}\\s*=\\s*["']((?:\\\\.|[^"'\\\\]){1,700})["']`, "gi"),
    ];

    for (const re of patterns) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(html)) && out.length < maxCandidates) {
        const cleaned = cleanSmartStoreText(match[1], key.toLowerCase().includes("desc") ? 260 : 180);
        if (!cleaned || seen.has(cleaned)) continue;
        seen.add(cleaned);
        out.push(cleaned);
      }
    }
  }
  return out;
}

function normalizeSmartStoreImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = decodeJsLikeString(raw) ?? raw;
  try {
    // Some SmartStore bootstrap states contain percent-encoded image URLs.
    if (/^https?%3a%2f%2f/i.test(s)) s = decodeURIComponent(s);
  } catch {}
  s = s
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/gi, "&")
    .replace(/\\/g, "")
    .replace(/[\s"'<>]+$/g, "")
    .replace(/[),;]+$/g, "")
    .trim();
  if (s.startsWith("//")) s = `https:${s}`;
  if (!/^https?:\/\//i.test(s)) return null;

  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (!/(^|\.)(shop-phinf|shopping-phinf|phinf)\.pstatic\.net$/.test(host)) return null;
    const lowerPath = u.pathname.toLowerCase();
    if (lowerPath.includes("favicon") || lowerPath.includes("logo") || lowerPath.includes("sprite") || lowerPath.endsWith(".svg")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

type SmartStoreImageCandidate = {
  url: string;
  key: string;
  source: "json_key" | "product_context" | "direct" | "encoded";
  context: string;
  index: number;
};

function normalizeSmartStoreScanText(html: string): string {
  return html
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'")
    .replace(/\\u003A/gi, ":")
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003D/gi, "=");
}

function compactDebugContext(input: string, max = 700): string {
  return input.replace(/\s+/g, " ").slice(0, max);
}

function collectSmartStoreImageCandidatesDetailed(html: string): SmartStoreImageCandidate[] {
  const out: SmartStoreImageCandidate[] = [];
  const seen = new Set<string>();
  const scans = Array.from(new Set([html, normalizeSmartStoreScanText(html)]));

  const push = (
    raw: string | null | undefined,
    source: SmartStoreImageCandidate["source"],
    key: string,
    context: string,
    index: number,
  ) => {
    const url = normalizeSmartStoreImageUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, source, key, context: compactDebugContext(context), index });
  };

  // Strong product-state keys. These are the candidates we want for SmartStore and
  // BrandStore product pages. Store profile/logo images commonly appear near
  // channel/seller/store keys, so context is retained for scoring.
  const strongKeyRe = /["']?(representativeImageUrl|repImageUrl|productImageUrl|originProductImageUrl|originalImageUrl|mainImageUrl|mobileImageUrl|detailImageUrl|imageUrl|thumbnailUrl|imgUrl|url)["']?\s*:\s*["']((?:\\.|[^"'\\]){1,2200})["']/gi;
  for (const scan of scans) {
    let match: RegExpExecArray | null;
    while ((match = strongKeyRe.exec(scan)) && out.length < 80) {
      const index = match.index;
      const context = scan.slice(Math.max(0, index - 520), Math.min(scan.length, index + 920));
      push(match[2], "json_key", match[1], context, index);
    }
  }

  // Product arrays sometimes place URLs under a generic "url" key. Search only
  // windows that look like product/image state to avoid store logos or unrelated UI.
  const productWindowRe = /(?:productImages|productImage|representativeImage|originProduct|A_PRODUCT|productNo|productName|salePrice|discountedSalePrice|benefitsView|contentsNo)[\s\S]{0,4500}/gi;
  for (const scan of scans) {
    let windowMatch: RegExpExecArray | null;
    while ((windowMatch = productWindowRe.exec(scan)) && out.length < 120) {
      const window = windowMatch[0];
      const baseIndex = windowMatch.index;
      const urlRe = /https?:\/?\/?(?:shop-phinf|shopping-phinf|phinf)\.pstatic\.net\/?[^\s"'<>\\)]+/gi;
      let m: RegExpExecArray | null;
      while ((m = urlRe.exec(window)) && out.length < 120) {
        push(m[0], "product_context", "product_window", window, baseIndex + m.index);
      }
    }
  }

  const normalized = scans[1] ?? scans[0];
  const directRe = /https?:\/?\/?(?:shop-phinf|shopping-phinf|phinf)\.pstatic\.net\/?[^\s"'<>\\)]+/gi;
  let match: RegExpExecArray | null;
  while ((match = directRe.exec(normalized)) && out.length < 140) {
    const index = match.index;
    const context = normalized.slice(Math.max(0, index - 450), Math.min(normalized.length, index + 650));
    push(match[0], "direct", "direct_pstatic", context, index);
  }

  const encodedRe = /https?%3A%2F%2F(?:shop-phinf|shopping-phinf|phinf)\.pstatic\.net%2F[^\s"'<>\\)]+/gi;
  while ((match = encodedRe.exec(html)) && out.length < 160) {
    const index = match.index;
    const context = html.slice(Math.max(0, index - 450), Math.min(html.length, index + 650));
    push(match[0], "encoded", "encoded_pstatic", context, index);
  }

  return out;
}

function collectSmartStoreImageCandidates(html: string): string[] {
  return collectSmartStoreImageCandidatesDetailed(html).map((c) => c.url);
}

function scoreSmartStoreImageCandidate(c: SmartStoreImageCandidate): number {
  const lowerUrl = c.url.toLowerCase();
  const key = c.key.toLowerCase();
  const ctx = c.context.toLowerCase();
  let score = 0;

  if (c.source === "json_key") score += 34;
  if (c.source === "product_context") score += 46;
  if (c.source === "direct") score += 14;
  if (c.source === "encoded") score += 18;

  if (/(representative|repimage|originproduct|original|productimage|mainimage|mobileimage|detailimage)/i.test(key)) score += 80;
  if (/(productimages|productimage|representativeimage|originproduct|a_product)/i.test(ctx)) score += 60;
  if (/(productno|productname|saleprice|discountedsaleprice|benefitsview|reviewamount|productstatus)/i.test(ctx)) score += 28;
  if (/(viewsonic|상품|제품|product)/i.test(ctx)) score += 8;

  if (lowerUrl.includes("shop-phinf.pstatic.net")) score += 36;
  if (lowerUrl.includes("shopping-phinf.pstatic.net")) score += 30;
  if (lowerUrl.includes("phinf.pstatic.net")) score += 18;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(lowerUrl)) score += 18;
  if (lowerUrl.includes("type=w") || lowerUrl.includes("type=f")) score += 8;

  // Store/channel profile images and brand logos are exactly what we must avoid.
  // They can come from official OG metadata, but they are not the product preview.
  const badContext = /(logo|storelogo|channelprofile|profileimage|profileurl|sellerprofile|brandprofile|representimageurl|profile|favicon|sprite|badge)/i;
  if (badContext.test(key) || badContext.test(ctx) || /(logo|profile|favicon|sprite|badge)/i.test(lowerUrl)) score -= 160;
  if (/(banner|event|coupon|promotion|promo|recommend|related|ad_|advert|reviewthumbnail|talktalk|naverpay)/i.test(ctx + " " + lowerUrl)) score -= 80;

  // Product images normally appear after product state keys. Extremely early URLs
  // in the document are often logos, app icons, preload hints, or global assets.
  if (c.index < 1200 && !/(product|representative|origin|main|detail)/i.test(key + " " + ctx)) score -= 35;

  return score;
}

function pickBestSmartStoreImage(html: string): string | null {
  const candidates = collectSmartStoreImageCandidatesDetailed(html);
  if (!candidates.length) return null;

  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreSmartStoreImageCandidate(candidate) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked.find((entry) => entry.score >= 70);
  return best?.candidate.url ?? null;
}

function extractSmartStorePreviewFromHtml(sourceUrl: string, finalUrl: string, html: string): Partial<LinkPreview> | null {
  if (!isSmartStoreUrl(sourceUrl) && !isSmartStoreUrl(finalUrl)) return null;

  const titleCandidates = collectJsonStringValuesByKeys(html, [
    "productName",
    "productNm",
    "productTitle",
    "productDisplayName",
    "dispProductName",
    "dispNm",
    "goodsName",
    "itemName",
  ], 10);
  const descriptionCandidates = collectJsonStringValuesByKeys(html, [
    "productDescription",
    "productDesc",
    "description",
    "desc",
    "summary",
    "productSummary",
    "subTitle",
  ], 10);
  const siteNameCandidates = collectJsonStringValuesByKeys(html, [
    "channelName",
    "storeName",
    "mallName",
    "sellerName",
    "brandName",
  ], 8);

  const imageRaw = pickBestSmartStoreImage(html);
  const image = imageRaw ? wrapImageThroughWorker(imageRaw, finalUrl || sourceUrl) : null;

  const url = stripTrackingParams(finalUrl || sourceUrl);
  const preview: Partial<LinkPreview> = {
    url,
    title: titleCandidates[0] ?? null,
    description: descriptionCandidates.find((v) => v !== titleCandidates[0]) ?? null,
    image,
    site_name: siteNameCandidates[0] ?? "NAVER SmartStore",
  };

  return preview.title || preview.description || preview.image ? preview : null;
}


type HtmlAttrMap = Record<string, string>;

type GenericImageCandidate = {
  url: string;
  source: "meta" | "twitter" | "jsonld" | "link" | "img" | "source" | "script" | "direct";
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  index: number;
};

function parseHtmlAttrs(tag: string): HtmlAttrMap {
  const attrs: HtmlAttrMap = {};
  const re = /([^\s"'=<>`\/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag))) {
    const key = String(match[1] ?? "").trim().toLowerCase();
    if (!key) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = decodeHtmlEntities(value) ?? value;
  }
  return attrs;
}

function safeNumber(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/px$/i, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hostLabelFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    return host || null;
  } catch {
    return null;
  }
}


type PageKind = "portal_home" | "brand_home" | "commerce_product" | "content" | "generic";

function urlParts(url: string | null | undefined): { host: string; path: string } | null {
  try {
    const u = new URL(String(url ?? ""));
    return {
      host: u.hostname.toLowerCase().replace(/^www\./, ""),
      path: u.pathname || "/",
    };
  } catch {
    return null;
  }
}

function normalizedHost(url: string | null | undefined): string {
  return urlParts(url)?.host.replace(/^m\./, "") ?? "";
}

function isRootLikePath(path: string | null | undefined): boolean {
  const p = String(path ?? "/").trim() || "/";
  return p === "/" || p === "" || p === "/index.html" || p === "/index.htm";
}

function isNaverMainUrl(url: string | null | undefined): boolean {
  const parts = urlParts(url);
  if (!parts) return false;
  const host = parts.host.replace(/^m\./, "");
  return host === "naver.com" && isRootLikePath(parts.path);
}

function isBmwShopHomeUrl(url: string | null | undefined): boolean {
  const parts = urlParts(url);
  if (!parts) return false;
  return parts.host === "shop.bmw.co.kr" && isRootLikePath(parts.path);
}

function isPortalHomeUrl(url: string | null | undefined): boolean {
  const parts = urlParts(url);
  if (!parts) return false;
  const host = parts.host.replace(/^m\./, "");
  if (!isRootLikePath(parts.path)) return false;
  return host === "naver.com" || host === "daum.net" || host === "zum.com" || host === "nate.com";
}

function isBrandHomeUrl(url: string | null | undefined): boolean {
  const parts = urlParts(url);
  if (!parts) return false;
  const host = parts.host;
  if (!isRootLikePath(parts.path)) return false;
  return host === "shop.bmw.co.kr" || host.endsWith(".bmw.co.kr");
}

function isCommerceProductUrl(url: string | null | undefined): boolean {
  try {
    const u = new URL(String(url ?? ""));
    const host = u.hostname.toLowerCase().replace(/^m\./, "");
    const path = u.pathname.toLowerCase();
    if (host.endsWith("smartstore.naver.com") || host.endsWith("brand.naver.com")) return /\/products\/\d+/.test(path);
    if (/\/(product|products|goods|item|shop|store)\//i.test(path)) return true;
    if (/(product|goods|item)(id|no|num)?=/i.test(u.search)) return true;
    return false;
  } catch {
    return false;
  }
}

function classifyPageKind(sourceUrl: string, finalUrl: string, title?: string | null, siteName?: string | null): PageKind {
  if (isCommerceProductUrl(sourceUrl) || isCommerceProductUrl(finalUrl)) return "commerce_product";
  if (isPortalHomeUrl(sourceUrl) || isPortalHomeUrl(finalUrl)) return "portal_home";
  if (isBrandHomeUrl(sourceUrl) || isBrandHomeUrl(finalUrl)) return "brand_home";

  const parts = urlParts(finalUrl || sourceUrl);
  if (parts && !isRootLikePath(parts.path)) return "content";

  const joined = `${title ?? ""} ${siteName ?? ""}`.toLowerCase();
  if (/(article|news|blog|post|product|상품|블로그|뉴스|기사)/i.test(joined)) return "content";
  return "generic";
}

function isProbablyBadPreviewImage(url: string, alt?: string | null): boolean {
  const lower = `${url} ${alt ?? ""}`.toLowerCase();
  return /(favicon|apple-touch-icon|mask-icon|sprite|spacer|pixel|blank|transparent|loading|placeholder|profile|avatar|badge|emblem|logo|banner_ad|banner-ad|ad_|_ad|\/ad\/|ads?|recommend|recommendation|related|promotion|promo|event|coupon|qr|barcode)/i.test(lower);
}

function isLikelyOfficialMetaSource(source: GenericImageCandidate["source"]): boolean {
  return source === "meta" || source === "twitter" || source === "jsonld";
}

function isLikelyProductImageUrl(url: string, alt?: string | null): boolean {
  const lower = `${url} ${alt ?? ""}`.toLowerCase();
  if (isProbablyBadPreviewImage(url, alt)) return false;
  return /(product|goods|item|detail|main|대표|상품|origin|original|large|zoom|thumbnail|thumb|shop-phinf|shopping-phinf|phinf\.pstatic\.net)/i.test(lower);
}

function trustedHostDistance(pageUrl: string, imageUrl: string): number {
  try {
    const page = new URL(pageUrl);
    const img = new URL(imageUrl);
    const ph = page.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const ih = img.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (ph === ih) return 0;
    if (ih.endsWith(`.${ph}`) || ph.endsWith(`.${ih}`)) return 1;
    if (/(pstatic\.net|naver\.net|googleusercontent\.com|fbcdn\.net|cdn|cloudfront|akamai|shopifycdn|cafe24img)/i.test(ih)) return 2;
    return 3;
  } catch {
    return 3;
  }
}

function naverMainFallbackPreview(sourceUrl: string): LinkPreview {
  const image = "https://s.pstatic.net/static/www/mobile/edit/2016/0705/mobile_212852414260.png";
  return {
    url: stripTrackingParams(sourceUrl),
    title: "네이버 모바일 메인",
    description: "네이버 모바일 메인에서 다양한 정보와 유용한 콘텐츠를 만나 보세요",
    site_name: "NAVER",
    image: wrapImageThroughWorker(image, sourceUrl),
  };
}

function bmwShopFallbackPreview(sourceUrl: string): LinkPreview {
  return {
    url: stripTrackingParams(sourceUrl),
    title: "BMW SHOP ONLINE",
    description: "여기를 눌러 링크를 확인하세요.",
    site_name: "BMW",
    image: null,
  };
}

function pickBaseHref(html: string, finalUrl: string): string {
  const tag = html.match(/<base\b[^>]*>/i)?.[0] ?? null;
  if (!tag) return finalUrl;
  const href = parseHtmlAttrs(tag).href;
  return resolveMaybeRelative(finalUrl, href) ?? finalUrl;
}

function pickLinkHrefByRel(html: string, relMatcher: RegExp, baseUrl: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags.slice(0, 80)) {
    const attrs = parseHtmlAttrs(tag);
    const rel = String(attrs.rel ?? "").toLowerCase();
    if (!relMatcher.test(rel)) continue;
    const href = resolveMaybeRelative(baseUrl, attrs.href ?? attrs.imagesrcset ?? null);
    if (href) return href;
  }
  return null;
}

function pickCanonicalUrl(html: string, baseUrl: string): string | null {
  return pickLinkHrefByRel(html, /(^|\s)canonical(\s|$)/i, baseUrl);
}

function collectMetaContents(html: string, keys: string[], maxCandidates = 16): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const safeKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${safeKey}["'][^>]*content=["']([^"']{1,2000})["'][^>]*>`, "gi"),
      new RegExp(`<meta[^>]+content=["']([^"']{1,2000})["'][^>]*(?:property|name|itemprop)=["']${safeKey}["'][^>]*>`, "gi"),
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=${safeKey}[^>]*content=([^\s>]{1,2000})[^>]*>`, "gi"),
    ];
    for (const re of patterns) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(html)) && out.length < maxCandidates) {
        const value = decodeJsLikeString(match[1]) ?? decodeHtmlEntities(match[1]) ?? match[1];
        const cleaned = value.replace(/\s+/g, " ").trim();
        if (!cleaned || seen.has(cleaned)) continue;
        seen.add(cleaned);
        out.push(cleaned);
      }
    }
  }
  return out;
}

function parseSrcSetCandidates(srcset: string | null | undefined, baseUrl: string): Array<{ url: string; width?: number | null }> {
  const raw = String(srcset ?? "").trim();
  if (!raw) return [];
  const out: Array<{ url: string; width?: number | null }> = [];
  for (const part of raw.split(",").slice(0, 16)) {
    const token = part.trim();
    if (!token) continue;
    const pieces = token.split(/\s+/);
    const url = resolveMaybeRelative(baseUrl, pieces[0] ?? null);
    if (!url) continue;
    const widthToken = pieces.find((p) => /\d+w$/i.test(p));
    const densityToken = pieces.find((p) => /\d+(\.\d+)?x$/i.test(p));
    const width = widthToken ? safeNumber(widthToken.replace(/w$/i, "")) : densityToken ? Math.round((safeNumber(densityToken.replace(/x$/i, "")) ?? 1) * 600) : null;
    out.push({ url, width });
  }
  return out;
}

function normalizeGenericImageUrl(raw: string | null | undefined, baseUrl: string): string | null {
  if (!raw) return null;
  let s = decodeJsLikeString(raw) ?? raw;
  try {
    if (/^https?%3a%2f%2f/i.test(s)) s = decodeURIComponent(s);
  } catch {}
  s = s
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/gi, "&")
    .replace(/[\s"'<>]+$/g, "")
    .replace(/[),;]+$/g, "")
    .trim();
  if (!s || /^data:/i.test(s) || /^blob:/i.test(s) || /^javascript:/i.test(s)) return null;
  if (s.startsWith("//")) s = `https:${s}`;
  const resolved = resolveMaybeRelative(baseUrl, s);
  if (!resolved) return null;
  try {
    const u = new URL(resolved);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const lower = `${u.hostname}${u.pathname}`.toLowerCase();
    if (lower.endsWith(".svg") || lower.endsWith(".ico")) return null;
    if (/(favicon|apple-touch-icon|mask-icon|sprite|spacer|pixel|blank|transparent|loading|placeholder)/i.test(lower)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function pushImageCandidate(
  out: GenericImageCandidate[],
  seen: Set<string>,
  baseUrl: string,
  rawUrl: string | null | undefined,
  source: GenericImageCandidate["source"],
  attrs?: { width?: number | null; height?: number | null; alt?: string | null },
) {
  const url = normalizeGenericImageUrl(rawUrl, baseUrl);
  if (!url || seen.has(url)) return;
  seen.add(url);
  out.push({
    url,
    source,
    width: attrs?.width ?? null,
    height: attrs?.height ?? null,
    alt: attrs?.alt ?? null,
    index: out.length,
  });
}

function collectJsonLdImageCandidates(html: string, baseUrl: string): GenericImageCandidate[] {
  const out: GenericImageCandidate[] = [];
  const seen = new Set<string>();
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];

  const visit = (value: any, depth = 0) => {
    if (depth > 6 || out.length >= 20 || value == null) return;
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value) || /^\/\//.test(value) || /\.(jpe?g|png|webp|avif)(\?|$)/i.test(value)) {
        pushImageCandidate(out, seen, baseUrl, value, "jsonld");
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 24)) visit(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;

    for (const key of ["image", "thumbnailUrl", "thumbnail", "contentUrl", "url"]) {
      if (value[key] != null) {
        if (typeof value[key] === "object" && !Array.isArray(value[key])) {
          pushImageCandidate(out, seen, baseUrl, value[key]?.url ?? value[key]?.contentUrl, "jsonld");
        } else {
          visit(value[key], depth + 1);
        }
      }
    }

    const graph = value["@graph"];
    if (Array.isArray(graph)) visit(graph, depth + 1);
  };

  for (const raw of scripts.slice(0, 8)) {
    const body = raw.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!body) continue;
    try {
      visit(JSON.parse(body), 0);
    } catch {}
  }
  return out;
}

function collectGenericImageCandidates(html: string, baseUrl: string): GenericImageCandidate[] {
  const out: GenericImageCandidate[] = [];
  const seen = new Set<string>();

  // Official share metadata first. These are the only image sources that are accepted
  // unconditionally on portal/brand home pages.
  for (const value of collectMetaContents(html, [
    "og:image",
    "og:image:url",
    "og:image:secure_url",
    "itemprop:image",
  ], 12)) {
    pushImageCandidate(out, seen, baseUrl, value, "meta");
  }

  for (const value of collectMetaContents(html, [
    "twitter:image",
    "twitter:image:src",
  ], 8)) {
    pushImageCandidate(out, seen, baseUrl, value, "twitter");
  }

  // Weaker legacy image metadata. Keep it, but it will be filtered by confidence rules.
  for (const value of collectMetaContents(html, [
    "image",
    "thumbnail",
    "thumbnailUrl",
    "thumbnail_url",
    "sailthru.image.full",
    "parsely-image-url",
  ], 8)) {
    pushImageCandidate(out, seen, baseUrl, value, "link");
  }

  for (const c of collectJsonLdImageCandidates(html, baseUrl)) {
    pushImageCandidate(out, seen, baseUrl, c.url, "jsonld", c);
  }

  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags.slice(0, 120)) {
    const attrs = parseHtmlAttrs(tag);
    const rel = String(attrs.rel ?? "").toLowerCase();
    const as = String(attrs.as ?? "").toLowerCase();
    if (/(^|\s)(image_src|preload|prefetch)(\s|$)/i.test(rel) || as === "image") {
      pushImageCandidate(out, seen, baseUrl, attrs.href, "link");
      for (const ss of parseSrcSetCandidates(attrs.imagesrcset ?? attrs.srcset, baseUrl)) {
        pushImageCandidate(out, seen, baseUrl, ss.url, "link", { width: ss.width });
      }
    }
  }

  const sourceTags = html.match(/<source\b[^>]*>/gi) ?? [];
  for (const tag of sourceTags.slice(0, 80)) {
    const attrs = parseHtmlAttrs(tag);
    for (const ss of parseSrcSetCandidates(attrs.srcset ?? attrs["data-srcset"], baseUrl)) {
      pushImageCandidate(out, seen, baseUrl, ss.url, "source", { width: ss.width });
    }
  }

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgTags.slice(0, 180)) {
    const attrs = parseHtmlAttrs(tag);
    const width = safeNumber(attrs.width ?? attrs["data-width"]);
    const height = safeNumber(attrs.height ?? attrs["data-height"]);
    const alt = compactText(attrs.alt ?? attrs.title ?? null, 120);
    const candidateAttrs = [
      attrs.src,
      attrs["data-src"],
      attrs["data-original"],
      attrs["data-lazy-src"],
      attrs["data-image"],
      attrs["data-img"],
      attrs["data-url"],
      attrs["data-thumb"],
      attrs["data-thumbnail"],
      attrs["data-zoom-image"],
    ];
    for (const raw of candidateAttrs) pushImageCandidate(out, seen, baseUrl, raw, "img", { width, height, alt });
    for (const ss of parseSrcSetCandidates(attrs.srcset ?? attrs["data-srcset"], baseUrl)) {
      pushImageCandidate(out, seen, baseUrl, ss.url, "img", { width: ss.width ?? width, height, alt });
    }
  }

  const keyedImageRe = /["'](?:image|imageUrl|image_url|thumbnail|thumbnailUrl|thumbnail_url|mainImage|mainImageUrl|heroImage|ogImage|poster|posterUrl|productImageUrl|representativeImageUrl|repImageUrl|originalImageUrl)["']\s*:\s*["']((?:\\.|[^"'\\]){1,1800})["']/gi;
  let match: RegExpExecArray | null;
  while ((match = keyedImageRe.exec(html)) && out.length < 260) {
    pushImageCandidate(out, seen, baseUrl, match[1], "script");
  }

  const directImageRe = /https?:\\?\/\\?\/[^\s"'<>\\)]+\.(?:jpe?g|png|webp|avif)(?:\?[^\s"'<>\\)]*)?/gi;
  while ((match = directImageRe.exec(html)) && out.length < 280) {
    pushImageCandidate(out, seen, baseUrl, match[0], "direct");
  }

  return out;
}

function scoreImageCandidate(c: GenericImageCandidate, pageUrl = ""): number {
  let score = 0;
  switch (c.source) {
    case "meta": score += 150; break;
    case "twitter": score += 145; break;
    case "jsonld": score += 132; break;
    case "link": score += 78; break;
    case "source": score += 64; break;
    case "img": score += 56; break;
    case "script": score += 46; break;
    case "direct": score += 34; break;
  }

  const lower = c.url.toLowerCase();
  const alt = String(c.alt ?? "").toLowerCase();
  const w = c.width ?? null;
  const h = c.height ?? null;

  if (/\.(jpe?g|png|webp|avif)(\?|$)/i.test(lower)) score += 22;
  if (/(product|goods|item|main|대표|hero|cover|thumb|thumbnail|large|origin|original|detail|og|image)/i.test(lower)) score += 16;
  if (/(product|goods|item|main|대표|상품|cover|thumbnail)/i.test(alt)) score += 10;
  if (isProbablyBadPreviewImage(c.url, c.alt)) score -= 120;
  if (/\.(gif)(\?|$)/i.test(lower)) score -= 18;

  const hostDistance = pageUrl ? trustedHostDistance(pageUrl, c.url) : 3;
  if (hostDistance === 0) score += 16;
  else if (hostDistance === 1) score += 10;
  else if (hostDistance === 2) score += 4;
  else score -= 12;

  if (w && h) {
    const area = w * h;
    const minSide = Math.min(w, h);
    const ratio = w / h;
    if (area >= 160_000) score += 42;
    else if (area >= 80_000) score += 30;
    else if (area >= 30_000) score += 14;
    if (minSide < 90) score -= 60;
    if (ratio > 5 || ratio < 0.18) score -= 42;
  } else if (w) {
    if (w >= 600) score += 28;
    else if (w >= 300) score += 16;
    else if (w < 120) score -= 40;
  } else if (!isLikelyOfficialMetaSource(c.source)) {
    // Non-official images without dimensions are often ads or layout assets.
    score -= 16;
  }

  // Earlier image tags are usually closer to the primary article/product image.
  score -= Math.min(22, c.index * 0.16);
  return score;
}

function pickBestGenericImage(
  html: string,
  baseUrl: string,
  sourceUrl = baseUrl,
  pageKind: PageKind = "generic",
): string | null {
  const candidates = collectGenericImageCandidates(html, baseUrl)
    .filter((c) => !!normalizeGenericImageUrl(c.url, baseUrl));
  if (!candidates.length) return null;

  const pageUrl = baseUrl || sourceUrl;
  const sorted = candidates
    .map((candidate) => ({ candidate, score: scoreImageCandidate(candidate, pageUrl) }))
    .sort((a, b) => b.score - a.score);

  for (const { candidate, score } of sorted) {
    const official = isLikelyOfficialMetaSource(candidate.source);
    const productish = isLikelyProductImageUrl(candidate.url, candidate.alt);

    if (isProbablyBadPreviewImage(candidate.url, candidate.alt)) continue;

    // Portal/brand root pages must be conservative. Never show random body images
    // such as shopping ads, campaign banners, shoes, event thumbnails, etc.
    if (pageKind === "portal_home" || pageKind === "brand_home") {
      if (official && score >= 95) return candidate.url;
      continue;
    }

    // Official share metadata is acceptable unless it was obviously an icon/ad.
    if (official && score >= 80) return candidate.url;

    // Product/detail pages may use high-confidence product images even if they are
    // emitted from script/img tags.
    if (pageKind === "commerce_product") {
      if (productish && score >= 82) return candidate.url;
      continue;
    }

    // Article/content pages can use visible body images, but only with enough evidence.
    if (pageKind === "content") {
      if ((candidate.source === "img" || candidate.source === "source" || candidate.source === "link") && score >= 112) return candidate.url;
      continue;
    }

    // Generic/root pages should not over-collect. Bad image is worse than no image.
    if ((candidate.source === "link" || candidate.source === "img" || candidate.source === "source") && score >= 132) {
      return candidate.url;
    }
  }

  return null;
}

async function fetchTextDetailed(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
  maxBytes = HTML_MAX_BYTES,
  headers?: Record<string, string>,
): Promise<FetchDetailedResult> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: headers ?? chromeLikeHeaders(url, true),
    });
    const finalUrl = res.url || url;
    if (!res.ok) return { kind: "failed", reason: `http_${res.status}`, finalUrl };

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("application/xhtml") && !ct.includes("text/plain")) {
      return { kind: "none", reason: `content_type_${ct || "unknown"}`, finalUrl };
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    const sliced = buf.length > maxBytes ? buf.slice(0, maxBytes) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
    if (!html.trim()) return { kind: "none", reason: "empty_html", finalUrl };
    return { kind: "ok", finalUrl, html };
  } catch (e) {
    const name = e instanceof Error ? e.name : "unknown";
    return { kind: "failed", reason: name === "AbortError" ? "timeout" : `fetch_${name}`, finalUrl: url };
  } finally {
    clearTimeout(t);
  }
}

async function fetchSmartStoreTextDetailed(url: string): Promise<FetchDetailedResult> {
  const profiles = smartStoreHtmlHeaderProfiles(url);
  const reasons: string[] = [];

  for (const profile of profiles) {
    const result = await fetchTextDetailed(url, Math.min(FETCH_TIMEOUT_MS, 8500), HTML_MAX_BYTES, profile.headers);
    if (result.kind === "ok") return result;
    reasons.push(`${profile.label}:${result.reason}`);

    // 429/403 usually means the edge or origin denied the request profile. Try the
    // next profile, but do not spin aggressively; the worker only does one pass per job.
    if (result.kind === "none") return result;
  }

  return { kind: "failed", reason: reasons.slice(0, 4).join(",") || "smartstore_fetch_failed", finalUrl: url };
}

function domainFallbackPreview(sourceUrl: string, reason: string): LinkPreview | null {
  try {
    const u = new URL(sourceUrl);
    const host = u.hostname.toLowerCase().replace(/^m\./, "");

    if (isNaverMainUrl(sourceUrl)) {
      return naverMainFallbackPreview(sourceUrl);
    }

    if (isBmwShopHomeUrl(sourceUrl)) {
      return bmwShopFallbackPreview(sourceUrl);
    }

    if (host.endsWith("smartstore.naver.com") || host.endsWith("brand.naver.com")) {
      const productId = u.pathname.match(/\/products\/(\d+)/)?.[1];
      return {
        url: stripTrackingParams(sourceUrl),
        title: "네이버 스마트스토어 상품",
        description: productId ? `상품 번호 ${productId}` : "스마트스토어 상품 페이지",
        site_name: "NAVER SmartStore",
        image: null,
      };
    }

    if (host === "play.google.com") {
      const appId = u.searchParams.get("id") || "";
      return {
        url: sourceUrl,
        title: "Google Play 앱",
        description: appId ? appId : "Google Play Store",
        site_name: "Google Play",
        image: null,
      };
    }

    if (reason.startsWith("content_type_") || reason === "empty_html" || reason === "no_meta") {
      return {
        url: sourceUrl,
        title: host || "링크",
        description: sourceUrl,
        site_name: host || null,
        image: null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function extractPreviewFromHtml(sourceUrl: string, finalUrl: string, html: string): LinkPreview | null {
  if (isNaverMainUrl(sourceUrl) || isNaverMainUrl(finalUrl)) {
    // Naver mobile/main is a portal page. Its body contains many changing services,
    // ads, and shopping modules; using body images causes false previews.
    // Keep a deterministic official-like card instead of scraping random content.
    return naverMainFallbackPreview(sourceUrl);
  }

  const baseUrl = pickBaseHref(html, finalUrl || sourceUrl);
  const jsonLd = pickJsonLdPreview(html, baseUrl);
  const smartStore = extractSmartStorePreviewFromHtml(sourceUrl, baseUrl, html);

  const canonicalUrl = pickCanonicalUrl(html, baseUrl);
  const metaUrl = collectMetaContents(html, ["og:url", "twitter:url", "url"], 4)[0] ?? null;
  const resolvedPreviewUrl =
    resolveMaybeRelative(baseUrl, metaUrl) ??
    canonicalUrl ??
    smartStore?.url ??
    baseUrl ??
    sourceUrl;

  const ogTitle =
    pickMetaContent(html, ["og:title", "twitter:title", "title", "application-name", "itemprop:name"]) ??
    jsonLd.title ??
    smartStore?.title ??
    pickTitle(html);

  const ogDesc =
    pickMetaContent(html, ["og:description", "description", "twitter:description", "itemprop:description"]) ??
    jsonLd.description ??
    smartStore?.description ??
    null;

  const siteName =
    pickMetaContent(html, ["og:site_name", "application-name", "twitter:site"]) ??
    jsonLd.site_name ??
    smartStore?.site_name ??
    hostLabelFromUrl(resolvedPreviewUrl);

  const pageKind = classifyPageKind(sourceUrl, resolvedPreviewUrl, ogTitle, siteName);

  let image: string | null = null;
  const isNaverCommerceProduct = pageKind === "commerce_product" && (isSmartStoreUrl(sourceUrl) || isSmartStoreUrl(resolvedPreviewUrl));
  if (smartStore?.image && pageKind === "commerce_product") {
    image = smartStore.image;
  } else if (isNaverCommerceProduct) {
    // For Naver SmartStore/BrandStore product pages, do not fall back to generic
    // OG/body images when the product adapter did not find a product image. Those
    // generic images are frequently store logos, channel profiles, banners, or
    // related products. A missing image is better than a wrong logo preview.
    image = null;
  } else {
    const genericImageRaw = pickBestGenericImage(html, baseUrl, sourceUrl, pageKind);
    image = genericImageRaw ? wrapImageThroughWorker(genericImageRaw, baseUrl || sourceUrl) : null;
  }

  // Brand roots without explicit OG/JSON-LD images should stay text-only. Do not
  // leak campaign, shoe, event, or related-product images into a generic homepage card.
  if (!image && isBmwShopHomeUrl(sourceUrl)) {
    const fallback = bmwShopFallbackPreview(sourceUrl);
    return {
      ...fallback,
      title: compactText(ogTitle, 160) ?? fallback.title,
      description: compactText(ogDesc, 260) ?? fallback.description,
      site_name: compactText(siteName, 80) ?? fallback.site_name,
    };
  }

  const preview: LinkPreview = {
    url: resolvedPreviewUrl,
    title: compactText(ogTitle, 160),
    description: compactText(ogDesc, 260),
    image,
    site_name: compactText(siteName, 80),
  };

  if (preview.title || preview.description || preview.image || preview.site_name) return preview;
  return smartStore?.url ? (smartStore as LinkPreview) : null;
}

async function buildLinkPreviewResult(url: string): Promise<LinkPreviewResult> {
  const candidates = buildFetchCandidates(url);
  const reasons: string[] = [];
  let firstFallback: LinkPreview | null = null;

  for (const candidate of candidates) {
    const isSmart = isSmartStoreUrl(candidate);
    const resolvedUrl = isSmart ? candidate : naverMobileize(await resolveFinalUrl(candidate));
    const fetched = isSmart ? await fetchSmartStoreTextDetailed(resolvedUrl) : await fetchTextDetailed(resolvedUrl);

    if (fetched.kind === "ok") {
      const preview = extractPreviewFromHtml(url, fetched.finalUrl, fetched.html);
      if (preview) return { status: "ready", preview, source: "html" };
      const fallback = domainFallbackPreview(fetched.finalUrl || url, "no_meta");
      if (fallback && !firstFallback) firstFallback = fallback;
      reasons.push(`${resolvedUrl}:no_meta`);
      continue;
    }

    const reason = `${resolvedUrl}:${fetched.reason}`;
    reasons.push(reason);
    const fallback = domainFallbackPreview(fetched.finalUrl || resolvedUrl || url, fetched.reason);
    if (fallback && !firstFallback) firstFallback = fallback;

    // On explicit non-HTML content there is no point retrying the same domain forever.
    if (fetched.kind === "none" && fallback) {
      return { status: "ready", preview: fallback, source: "fallback" };
    }
  }

  if (firstFallback) return { status: "ready", preview: firstFallback, source: "fallback" };
  const reason = reasons.slice(0, 6).join(" | ") || "no_candidates";
  return { status: "failed", reason };
}

async function publishPreview(job: LinkPreviewJob, preview: LinkPreview) {
  const { data: updated, error } = await supabaseAdmin
    .from("chat_messages")
    .update({
      link_preview: preview,
      link_preview_url: preview.url,
      link_preview_status: "ready",
    })
    .eq("id", job.message_id)
    .select("id, room_id, room_seq, client_msg_id")
    .maybeSingle();

  if (error) throw new Error(`publish_preview_update_failed:${error.message}`);

  await broadcast(job.room_id, "message_patch", {
    id: job.message_id,
    client_msg_id: updated?.client_msg_id ?? null,
    room_id: updated?.room_id ?? job.room_id,
    room_seq: updated?.room_seq ?? null,
    link_preview: preview,
    link_preview_url: preview.url,
    link_preview_status: "ready",
  });

  await markDone(job.id, "done");
}

async function publishStatus(job: LinkPreviewJob, status: "none" | "failed") {
  const { data: updated } = await supabaseAdmin
    .from("chat_messages")
    .update({ link_preview_status: status })
    .eq("id", job.message_id)
    .select("id, room_id, room_seq, client_msg_id")
    .maybeSingle();

  await broadcast(job.room_id, "message_patch", {
    id: job.message_id,
    client_msg_id: updated?.client_msg_id ?? null,
    room_id: updated?.room_id ?? job.room_id,
    room_seq: updated?.room_seq ?? null,
    link_preview_status: status,
  });
}

async function processJob(job: LinkPreviewJob): Promise<void> {
  const result = await buildLinkPreviewResult(job.source_url);

  if (result.status === "ready") {
    await publishPreview(job, result.preview);
    return;
  }

  if (result.status === "none") {
    if (result.fallback) {
      await publishPreview(job, result.fallback);
      return;
    }
    await publishStatus(job, "none");
    await markDone(job.id, "none");
    return;
  }

  if (result.fallback && job.attempt_count >= 2) {
    await publishPreview(job, result.fallback);
    return;
  }

  if (job.attempt_count >= MAX_ATTEMPTS) {
    await publishStatus(job, "failed");
    await markDead(job.id, result.reason || "preview_fetch_failed");
    return;
  }

  await markRetry(job.id, computeRetryDelaySeconds(job.attempt_count), result.reason || "preview_fetch_failed");
}

async function runWorkerLoop() {
  const deadline = Date.now() + LOOP_BUDGET_MS;
  let processed = 0;

  while (Date.now() < deadline) {
    const jobs = await claimJobs();
    if (!jobs.length) {
      if (processed > 0) break;
      await sleep(700);
      continue;
    }

    for (const job of jobs) {
      try {
        await processJob(job);
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (job.attempt_count >= MAX_ATTEMPTS) {
          await publishStatus(job, "failed").catch(() => {});
          await markDead(job.id, message);
        } else {
          await markRetry(job.id, computeRetryDelaySeconds(job.attempt_count), message);
        }
      }
      if (Date.now() >= deadline) break;
    }
  }

  return processed;
}

Deno.serve(async (req) => {
  const receivedAt = Date.now();

  try {
    if (!isAuthorized(req)) {
      errorLog("unauthorized", {
        method: req.method,
        hasAuthorization: Boolean(req.headers.get("Authorization")),
        hasApiKey: Boolean(req.headers.get("apikey") ?? req.headers.get("x-api-key")),
        hasFunctionsKey: Boolean(req.headers.get("x-functions-key")),
        hasWorkerSecret: Boolean(WORKER_SECRET),
        hasServiceRole: Boolean(SERVICE_ROLE_KEY),
      });

      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = await req.json().catch(() => null) as any | null;

    log("kick_received", {
      method: req.method,
      source: typeof payload?.source === "string" ? payload.source : null,
      reason: typeof payload?.reason === "string" ? payload.reason : null,
      messageId: typeof payload?.message_id === "number" ? payload.message_id : null,
      roomId: typeof payload?.room_id === "number" ? payload.room_id : null,
      hasWorkerSecret: Boolean(WORKER_SECRET),
      hasServiceRole: Boolean(SERVICE_ROLE_KEY),
    });

    const promise = runWorkerLoop()
      .then((processed) => {
        log("loop_done", {
          processed,
          durationMs: Date.now() - receivedAt,
          workerId: WORKER_ID,
        });
      })
      .catch((error: any) => {
        errorLog("loop_failed", {
          error: String(error?.message ?? error),
          durationMs: Date.now() - receivedAt,
          workerId: WORKER_ID,
        });
      });

    const er = (globalThis as any).EdgeRuntime;
    if (er?.waitUntil) {
      er.waitUntil(promise);
    } else {
      promise.catch((error: any) => {
        errorLog("background_error", {
          error: String(error?.message ?? error),
          workerId: WORKER_ID,
        });
      });
    }

    return new Response(JSON.stringify({ ok: true, started: true, worker_id: WORKER_ID, at: nowIso() }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    errorLog("fatal", {
      error: String(e?.message ?? e),
      durationMs: Date.now() - receivedAt,
      workerId: WORKER_ID,
    });

    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
