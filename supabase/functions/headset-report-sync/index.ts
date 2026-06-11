import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders, extractBearer, verifyDeviceToken } from "../_shared/device-jwt.ts";

// Receives the result of a sync cycle from the Quest app.
// Two modes:
//   - { phase: "started" } → creates a new sync_reports row, returns its id
//   - { phase: "finished", report_id, status, ... } → updates the row

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
    phase?: "started" | "finished";
    report_id?: string;
    status?: "success" | "partial" | "failed";
    downloaded_count?: number;
    failed_count?: number;
    deleted_count?: number;
    total_bytes?: number;
    error_message?: string;
    details?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!body.phase || body.phase === "started") {
    const { data, error } = await supabase
      .from("sync_reports")
      .insert({ headset_id: claims.sub, status: "started" })
      .select("id")
      .single();
    if (error || !data) {
      console.error("sync_reports insert error", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ report_id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (body.phase === "finished") {
    if (!body.report_id || !body.status) {
      return new Response(
        JSON.stringify({ error: "report_id and status are required when phase=finished" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { error } = await supabase
      .from("sync_reports")
      .update({
        status: body.status,
        finished_at: new Date().toISOString(),
        downloaded_count: body.downloaded_count ?? 0,
        failed_count: body.failed_count ?? 0,
        deleted_count: body.deleted_count ?? 0,
        total_bytes: body.total_bytes ?? 0,
        error_message: body.error_message ?? null,
        details: (body.details ?? null) as any,
      })
      .eq("id", body.report_id)
      .eq("headset_id", claims.sub);
    if (error) {
      console.error("sync_reports update error", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown phase" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});