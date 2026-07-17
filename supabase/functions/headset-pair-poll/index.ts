import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/device-jwt.ts";

// The Quest headset polls this endpoint (no user auth) using its
// {code, pairing_secret}. Once the admin has claimed the code from the
// dashboard, this returns the long-lived device token exactly once (atomic RPC).

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { code?: string; pairing_secret?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.code || !body.pairing_secret) {
    return new Response(JSON.stringify({ error: "Missing code or pairing_secret" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("claim_pairing_device_token", {
    _code: body.code,
    _pairing_secret: body.pairing_secret,
  });

  if (error) {
    console.error("claim_pairing_device_token error", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  const status = row?.status ?? "not_found";

  if (status === "not_found") {
    return new Response(JSON.stringify({ status: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (status === "unauthorized") {
    return new Response(JSON.stringify({ status: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (status === "expired" || status === "pending") {
    return new Response(JSON.stringify({ status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (status === "claimed" && row?.device_token && row?.headset_id) {
    return new Response(
      JSON.stringify({
        status: "claimed",
        headset_id: row.headset_id,
        device_token: row.device_token,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ status: "pending" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
