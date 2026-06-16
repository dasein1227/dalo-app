// supabase/functions/home-banners/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReqBody = {
  lat: number;
  lng: number;
  limit?: number;        // 배너 개수
  ttlMinutes?: number;   // weather TTL (10~20 권장)
  forceWeather?: boolean;
  overrideRadiusM?: number | null; // 필요 시 오버라이드 (기본은 profiles.neighborhood_radius_m)
};

type WeatherSummary =
  | "clear"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder"
  | "unknown";

function resp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

// 0.005도 ≈ 400~600m 격자(도시권 캐시 효율 좋음)
function makeGridKey(lat: number, lng: number) {
  const step = Number(Deno.env.get("WEATHER_GRID_STEP_DEG") ?? "0.005");
  const latKey = roundToStep(lat, step).toFixed(3);
  const lngKey = roundToStep(lng, step).toFixed(3);
  return `${latKey},${lngKey}`;
}

function toSummaryFromWeatherCode(code: number | null | undefined): WeatherSummary {
  if (code == null) return "unknown";
  if (code === 0) return "clear";
  if ([1, 2, 3].includes(code)) return "cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunder";
  return "unknown";
}

/**
 * Provider는 ENV로 스위치할 수 있게 고정:
 * - WEATHER_PROVIDER=open_meteo (기본/무료)
 * - 나중에 유료로 갈 때 provider 분기만 추가
 */
async function fetchWeather(lat: number, lng: number) {
  const provider = Deno.env.get("WEATHER_PROVIDER") ?? "open_meteo";
  const apiBase =
    Deno.env.get("WEATHER_API_BASE") ?? "https://api.open-meteo.com/v1/forecast";
  const apiKey = Deno.env.get("WEATHER_API_KEY") ?? "";
  const timezone = Deno.env.get("WEATHER_TIMEZONE") ?? "Asia/Seoul";

  if (provider !== "open_meteo") {
    // 유료 전환 시: 여기 분기 추가
    throw new Error(`Unsupported WEATHER_PROVIDER=${provider}`);
  }

  const url = new URL(apiBase);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,precipitation,weather_code");
  url.searchParams.set("timezone", timezone);
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("precipitation_unit", "mm");
  if (apiKey) url.searchParams.set("apikey", apiKey);

  const r = await fetch(url.toString(), {
    headers: { "User-Agent": "coonn-home-banners/1.0" },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`WEATHER_API_${r.status}: ${t}`);
  }

  const data = await r.json();
  const cur = data?.current ?? {};
  const weather_code =
    typeof cur.weather_code === "number" ? cur.weather_code : null;
  const temp_c =
    typeof cur.temperature_2m === "number" ? cur.temperature_2m : null;
  const precipitation_mm =
    typeof cur.precipitation === "number" ? cur.precipitation : null;

  return {
    provider,
    weather_code,
    summary: toSummaryFromWeatherCode(weather_code),
    temp_c,
    precipitation_mm,
    raw: data,
  };
}

async function getWeatherSnapshot(params: {
  db: any;
  lat: number;
  lng: number;
  ttlMinutes: number;
  force: boolean;
}) {
  const { db, lat, lng, ttlMinutes, force } = params;
  const grid_key = makeGridKey(lat, lng);
  const nowIso = new Date().toISOString();

  if (!force) {
    const { data: hit } = await db
      .from("weather_snapshots")
      .select("*")
      .eq("grid_key", grid_key)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (hit) {
      return {
        cache: "hit" as const,
        snapshot: {
          grid_key: hit.grid_key,
          lat: hit.lat,
          lng: hit.lng,
          provider: hit.provider,
          weather_code: hit.weather_code,
          summary: hit.summary,
          temp_c: hit.temp_c,
          precipitation_mm: hit.precipitation_mm,
          observed_at: hit.observed_at,
          expires_at: hit.expires_at,
        },
      };
    }
  }

  const w = await fetchWeather(lat, lng);
  const observedAt = new Date();
  const expiresAt = new Date(observedAt.getTime() + ttlMinutes * 60 * 1000);

  const payload = {
    grid_key,
    lat,
    lng,
    provider: w.provider,
    weather_code: w.weather_code,
    summary: w.summary,
    temp_c: w.temp_c,
    precipitation_mm: w.precipitation_mm,
    observed_at: observedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    raw: w.raw,
  };

  await db.from("weather_snapshots").upsert(payload, { onConflict: "grid_key" });

  return {
    cache: "miss" as const,
    snapshot: {
      grid_key,
      lat,
      lng,
      provider: payload.provider,
      weather_code: payload.weather_code,
      summary: payload.summary,
      temp_c: payload.temp_c,
      precipitation_mm: payload.precipitation_mm,
      observed_at: payload.observed_at,
      expires_at: payload.expires_at,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return resp(200, { ok: true });
  if (req.method !== "POST") return resp(405, { error: "METHOD_NOT_ALLOWED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 인증 확인(클라 invoke 시 Authorization 헤더)
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await authClient.auth.getUser();
  if (!userData?.user) return resp(401, { error: "UNAUTHORIZED" });

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return resp(400, { error: "BAD_JSON" });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return resp(400, { error: "INVALID_LAT_LNG" });
  }

  const limit = Math.max(1, Math.min(12, Number(body.limit ?? 6)));
  const ttlMinutes = Math.max(10, Math.min(20, Number(body.ttlMinutes ?? 15)));
  const forceWeather = Boolean(body.forceWeather ?? false);
  const overrideRadiusM =
    body.overrideRadiusM == null ? null : Number(body.overrideRadiusM);

  const db = createClient(supabaseUrl, serviceKey);

  // 1) 날씨 스냅샷(캐시 내장)
  let weather: any = null;
  try {
    weather = await getWeatherSnapshot({
      db,
      lat,
      lng,
      ttlMinutes,
      force: forceWeather,
    });
  } catch (e) {
    // 날씨 실패는 기능 치명도가 낮으니 배너는 계속 진행
    weather = { cache: "error", error: String(e?.message ?? e) };
  }

  // 2) 배너 후보군 호출 (네가 만든 RPC)
  const { data: candidates, error: candErr } = await db.rpc(
    "home_banner_candidates_v1",
    {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: overrideRadiusM, // null이면 profiles.neighborhood_radius_m 사용
      p_limit: 80,
    },
  );

  if (candErr) {
    return resp(500, { ok: false, error: "CANDIDATES_FAILED", detail: candErr.message, weather });
  }

  // 3) 아직 AI 단계 전이므로, 우선 상위 limit개를 배너로 변환 (AI는 다음 단계)
  const items =
    (candidates ?? [])
      .slice(0, limit)
      .map((r: any) => ({
        business_id: r.business_id,
        image_url: r.hero_image_url,
        title: r.has_active_event ? "지금 진행 중인 이벤트" : "오늘의 추천",
        subtitle: `${r.name}${r.distance_m != null ? ` · ${r.distance_m}m` : ""}`,
        tag: r.category_major || r.category || "추천",
        meta: {
          distance_m: r.distance_m,
          rating: r.rating,
          review_count: r.review_count,
          has_active_event: r.has_active_event,
          is_open_now: r.is_open_now,
        },
      }));

  return resp(200, { ok: true, weather, items });
});
