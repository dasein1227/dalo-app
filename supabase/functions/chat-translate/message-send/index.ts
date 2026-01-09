import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// ✅ URL 감지(카톡/텔레그램 스타일)
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/i;

function trimTrailingPunct(u: string) {
  return u.replace(/[)\],.?!]+$/g, "");
}

function tryHostname(u: string) {
  try {
    return new URL(u).hostname || "웹";
  } catch {
    return "웹";
  }
}

function decodeHtmlEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function pickMeta(html: string, key: string) {
  // property="og:title" content="..."
  const re1 = new RegExp(
    `<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  // name="twitter:title" content="..."
  const re2 = new RegExp(
    `<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const m = html.match(re1) ?? html.match(re2);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
}

function pickTitleTag(html: string) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
}

function absUrl(base: string, maybe: string | null) {
  if (!maybe) return null;
  const s = maybe.trim();
  if (!s) return null;
  try {
    return new URL(s, base).toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; COONNBot/1.0)",
        "accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const ct = res.headers.get("content-type") ?? "";
    // HTML이 아니면 OG 파싱 의미 없음
    if (!ct.toLowerCase().includes("text/html")) {
      return { ok: false, html: null, status: res.status };
    }

    const html = await res.text();
    return { ok: res.ok, html, status: res.status };
  } finally {
    clearTimeout(t);
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  room_id: number;
  sender_id: string;
  kind?: string;
  is_notice?: boolean;

  content: string;
  original?: string;

  source_lang?: string | null;
  sender_selected_tier?: string | null;
  max_generated_tier?: string | null;
  client_msg_id?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({
          error: "ENV_MISSING",
          detail: "SUPABASE_URL / SUPABASE_ANON_KEY is missing in Edge env",
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // ✅ 요청자의 JWT로 동작(RLS 적용)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "UNAUTHORIZED", detail: "Missing Bearer token" }),
        {
          status: 401,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const body = (await req.json()) as Payload;

    const room_id = body.room_id;
    const sender_id = body.sender_id;
    const content = String(body.content ?? "");

    if (!room_id || !sender_id || !content.trim()) {
      return new Response(JSON.stringify({ error: "INVALID_PAYLOAD" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const kind = String(body.kind ?? "text");
    const is_notice = !!body.is_notice;
    const original = typeof body.original === "string" ? body.original : content;

    // ✅ link_preview는 URL 있으면 절대 NULL 되지 않게
    let link_preview: any = null;

    const match = content.match(URL_REGEX);
    if (match?.[0]) {
      const url = trimTrailingPunct(match[0]);
      const host = tryHostname(url);

      // fallback(절대 NULL 금지)
      link_preview = {
        url,
        title: host,
        description: null,
        image: null,
        site_name: host,
      };

      // OG 파싱 시도(실패해도 fallback 유지)
      try {
        const { ok, html } = await fetchHtml(url, 5000);
        if (ok && html) {
          const ogTitle =
            pickMeta(html, "og:title") ??
            pickMeta(html, "twitter:title") ??
            pickTitleTag(html);

          const ogDesc =
            pickMeta(html, "og:description") ??
            pickMeta(html, "twitter:description");

          const ogSite = pickMeta(html, "og:site_name");

          const ogImg =
            pickMeta(html, "og:image") ??
            pickMeta(html, "twitter:image") ??
            pickMeta(html, "twitter:image:src");

          link_preview = {
            url,
            title: (ogTitle ?? "").trim() || link_preview.title,
            description: (ogDesc ?? "").trim() || null,
            image: absUrl(url, ogImg),
            site_name: (ogSite ?? "").trim() || link_preview.site_name,
          };
        }
      } catch {
        // ignore
      }
    }

    const insertRow: any = {
      room_id,
      sender_id,
      kind,
      is_notice,
      content,
      original,
      link_preview,
      source_lang: body.source_lang ?? null,
      sender_selected_tier: body.sender_selected_tier ?? null,
      max_generated_tier: body.max_generated_tier ?? null,
      client_msg_id: body.client_msg_id ?? null,
    };

    const { data, error } = await supabase
      .from("chat_messages")
      .insert(insertRow)
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: "DB_INSERT_FAILED", detail: error.message }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ success: true, message: data }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        detail: err?.message ?? String(err),
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
