import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders, extractBearer, verifyDeviceToken } from "../_shared/device-jwt.ts";

// Lightweight ping sent by the Quest app (immediate on start/foreground, then periodically).
// Updates last_seen + last_heartbeat_at + diagnostics, returns sync hint.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = extractBearer(req);
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing device token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const claims = await verifyDeviceToken(token);
  if (!claims) {
    return new Response(JSON.stringify({ error: "Invalid device token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: {
    battery_percent?: number;
    storage_free_bytes?: number;
    storage_total_bytes?: number;
    app_version?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: existing, error: findErr } = await supabase
    .from("headsets")
    .select("id, status, desired_manifest_version, applied_manifest_version")
    .eq("id", claims.sub)
    .maybeSingle();

  if (findErr) {
    console.error("heartbeat lookup error", findErr);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!existing) {
    return new Response(JSON.stringify({ error: "Headset not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (existing.status === "revoked") {
    return new Response(JSON.stringify({ error: "Headset revoked" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    last_seen_at: nowIso,
    last_heartbeat_at: nowIso,
    last_contact_source: "heartbeat",
  };
  if (typeof body.battery_percent === "number") {
    update.battery_percent = Math.max(0, Math.min(100, Math.round(body.battery_percent)));
  }
  if (typeof body.storage_free_bytes === "number") update.storage_free_bytes = body.storage_free_bytes;
  if (typeof body.storage_total_bytes === "number") update.storage_total_bytes = body.storage_total_bytes;
  if (typeof body.app_version === "string" && body.app_version.length <= 64) update.app_version = body.app_version;

  const { error } = await supabase.from("headsets").update(update).eq("id", claims.sub);
  if (error) {
    console.error("heartbeat update error", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[HeadsetContact] headset_id=${claims.sub} source=heartbeat`);

  const desired = existing.desired_manifest_version ?? 0;
  const applied = existing.applied_manifest_version ?? 0;

  return new Response(JSON.stringify({
    ok: true,
    desired_manifest_version: desired,
    applied_manifest_version: applied,
    needs_sync: desired > applied,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
