// supabase/functions/push_dispatch/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

// 간단한 JSON 응답 헬퍼
function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// 배열을 일정 크기로 쪼개기 (배치 전송용)
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 🚀 메인 함수
serve(async (req: Request): Promise<Response> => {
  try {
    // 헬스체크용
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
          "Access-Control-Allow-Headers": "content-type,authorization",
        },
      });
    }

    if (req.method !== "POST" && req.method !== "GET") {
      return jsonRes({ ok: false, error: "method not allowed" }, 405);
    }

    // ✅ 환경변수 가져오기 (SUPABASE_ 접두어는 금지 → SB_로 등록)
    const supabaseUrl = Deno.env.get("SB_URL");
    const supabaseKey = Deno.env.get("SB_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return jsonRes({ ok: false, error: "Missing env SB_URL / SB_SERVICE_ROLE_KEY" }, 500);
    }

    const headers = {
      apiKey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    };

    // 1️⃣ 큐 상태 알림 가져오기
    const queued = await fetch(
      `${supabaseUrl}/rest/v1/app_notifications?status=eq.queued&limit=${BATCH_SIZE}`,
      { headers },
    );
    const notifs = (await queued.json()) as any[];

    if (!Array.isArray(notifs) || notifs.length === 0) {
      return jsonRes({ ok: true, message: "no queued notifications" });
    }

    // 2️⃣ 각 알림마다 Expo 푸시 전송
    const results: any[] = [];
    for (const n of notifs) {
      const devRes = await fetch(
        `${supabaseUrl}/rest/v1/user_devices?user_id=eq.${n.user_id}`,
        { headers },
      );
      const devices = (await devRes.json()) as any[];

      if (!devices?.length) {
        await fetch(`${supabaseUrl}/rest/v1/app_notifications?id=eq.${n.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            status: "failed",
            failed_at: new Date().toISOString(),
            error_message: "no device token",
          }),
        });
        continue;
      }

      const messages = devices.map((d) => ({
        to: d.expo_push_token,
        title: n.title,
        body: n.body,
        data: n.data || {},
        sound: "default",
        priority: "high",
      }));

      // Expo Push 서버에 전송 (100개씩 배치)
      for (const group of chunk(messages, 100)) {
        const expoRes = await fetch(EXPO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(group),
        });

        if (expoRes.ok) {
          await fetch(`${supabaseUrl}/rest/v1/app_notifications?id=eq.${n.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: "sent", sent_at: new Date().toISOString() }),
          });
        } else {
          const errText = await expoRes.text();
          await fetch(`${supabaseUrl}/rest/v1/app_notifications?id=eq.${n.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              status: "failed",
              failed_at: new Date().toISOString(),
              error_message: errText?.slice(0, 500),
            }),
          });
        }
      }

      results.push({ notif_id: n.id, devices: devices.length });
    }

    return jsonRes({ ok: true, processed: results.length, details: results });
  } catch (e) {
    return jsonRes({ ok: false, error: String(e) }, 500);
  }
});
