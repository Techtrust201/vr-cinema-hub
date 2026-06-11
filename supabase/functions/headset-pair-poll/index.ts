import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/device-jwt.ts";

// The Quest headset polls this endpoint (no user auth) using its
// {code, pairing_secret}. Once the admin has claimed the code from the
// dashboard, this returns the long-lived device token (read once).

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

  const { data: row, error } = await supabase
    .from("pairing_codes")
    .select("id, pairing_secret, expires_at, claimed_by_headset_id, device_token, failed_attempts")
    .eq("code", body.code)
    .maybeSingle();

  if (error || !row) {
    return new Response(JSON.stringify({ status: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Bad secret → bump failed_attempts (basic brute-force defense).
  if (row.pairing_secret !== body.pairing_secret) {
    await supabase
      .from("pairing_codes")
      .update({ failed_attempts: (row.failed_attempts ?? 0) + 1 })
      .eq("id", row.id);
    return new Response(JSON.stringify({ status: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ status: "expired" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!row.claimed_by_headset_id || !row.device_token) {
    return new Response(JSON.stringify({ status: "pending" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Claimed → return token and wipe it from the pairing row.
  const device_token = row.device_token;
  const headset_id = row.claimed_by_headset_id;
  await supabase
    .from("pairing_codes")
    .update({ device_token: null })
    .eq("id", row.id);

  return new Response(
    JSON.stringify({ status: "claimed", headset_id, device_token }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});