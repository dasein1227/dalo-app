// supabase/functions/link-preview-image/index.ts
// Public image proxy fallback for link previews.
// Prefer link-preview-worker R2 persistence. This function remains as a safe fallback
// for hosts that reject direct mobile Image requests.

const MAX_BYTES = 4_000_000;
const DEFAULT_TTL_SEC = 60 * 60 * 24;
const CDN_TTL_SEC = 60 * 60 * 24 * 7;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

function chromeLikeHeaders(referer: string): Record<string, string> {
  return {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    referer,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-dest": "image",
    "cache-control": "no-cache",
    pragma: "no-cache",
  };
}

function sanitizeUrl(s: string | null): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function cacheKey(url: string, referer: string): string {
  let rh = "";
  try {
    rh = new URL(referer).host;
  } catch {
    rh = "";
  }
  return `https://cache.local/link-preview-image?u=${encodeURIComponent(url)}&rh=${encodeURIComponent(rh)}`;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: CORS_HEADERS });
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    const urlObj = new URL(req.url);
    const u = sanitizeUrl(urlObj.searchParams.get("u"));
    const r = sanitizeUrl(urlObj.searchParams.get("r")) ?? "https://www.naver.com/";

    if (!u) {
      return new Response("Bad Request", { status: 400, headers: CORS_HEADERS });
    }

    const key = cacheKey(u, r);
    const cache = (globalThis as any).caches?.default as Cache | undefined;

    if (cache) {
      const cached = await cache.match(key);
      if (cached) {
        if (req.method === "HEAD") {
          return new Response(null, { status: 200, headers: cached.headers });
        }
        return cached;
      }
    }

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);

    let res: Response;
    try {
      res = await fetch(u, {
        method: "GET",
        redirect: "follow",
        signal: ac.signal,
        headers: chromeLikeHeaders(r),
      });
    } finally {
      clearTimeout(t);
    }

    if (!res.ok) {
      return new Response("Upstream Failed", { status: 502, headers: CORS_HEADERS });
    }

    const ct = res.headers.get("content-type") ?? "image/jpeg";
    if (!ct.toLowerCase().startsWith("image/")) {
      return new Response("Not Image", { status: 415, headers: CORS_HEADERS });
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return new Response("No Body", { status: 502, headers: CORS_HEADERS });
    }

    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          try {
            await reader.cancel();
          } catch {}
          return new Response("Image Too Large", { status: 413, headers: CORS_HEADERS });
        }
        chunks.push(value);
      }
    }

    const body = chunks.length === 1 ? chunks[0] : concat(chunks, total);

    const headers = new Headers(CORS_HEADERS);
    headers.set("content-type", ct);
    headers.set("cache-control", `public, max-age=${DEFAULT_TTL_SEC}, s-maxage=${CDN_TTL_SEC}`);
    headers.set("x-robots-tag", "noindex");

    const out = new Response(req.method === "HEAD" ? null : body, { status: 200, headers });

    if (cache) {
      try {
        await cache.put(key, out.clone());
      } catch {}
    }

    return out;
  } catch {
    return new Response("Internal Error", { status: 500, headers: CORS_HEADERS });
  }
});

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
