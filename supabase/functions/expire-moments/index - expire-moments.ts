import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "1000");

  try {
    const { data, error } = await supabase.rpc("expire_moments_run", {
      max_loops: 20,
      batch_size: limit,
    });

    if (error) {
      console.error("expire error", error);
      return new Response(JSON.stringify(error), { status: 500 });
    }

    return new Response(
      JSON.stringify({
        expired: data,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
    });
  }
});