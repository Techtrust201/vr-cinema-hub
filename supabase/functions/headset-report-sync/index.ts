import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders, extractBearer, verifyDeviceToken } from "../_shared/device-jwt.ts";
import { getSecretKey } from "../_shared/supabase-keys.ts";

// Receives the result of a sync cycle from the Quest app.
// Two modes:
//   - { phase: "started" } → idempotent start via start_sync_report RPC
//   - { phase: "finished", report_id, status, ... } → transactional finalize_sync_report RPC

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
    status?: "success" | "partial" | "failed" | "no_change" | "pending" | "started";
    downloaded_count?: number;
    failed_count?: number;
    deleted_count?: number;
    total_bytes?: number;
    error_message?: string;
    details?: unknown;
    applied_manifest_version?: number;
    playlist_id?: string | null;
    remote_video_count?: number;
    local_video_count?: number;
    visible_video_count?: number;
    cause?: string;
    client_cycle_id?: string;
    session_id?: string;
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
    getSecretKey(),
  );

  if (!body.phase || body.phase === "started") {
    if (body.status && body.status === "pending") {
      return new Response(JSON.stringify({
        error: "pending is a server-computed state, not a report status",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data, error } = await supabase.rpc("start_sync_report", {
      _headset_id: claims.sub,
      _cause: body.cause ?? null,
      _client_cycle_id: body.client_cycle_id ?? null,
      _session_id: body.session_id ?? null,
    });
    if (error || !data) {
      console.error("start_sync_report error", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = data as { ok?: boolean; report_id?: string; error?: string };
    if (!result.ok || !result.report_id) {
      console.error("start_sync_report rejected", result);
      return new Response(JSON.stringify({ error: result.error ?? "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ report_id: result.report_id }), {
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
    const allowed = new Set(["success", "partial", "failed", "no_change"]);
    if (!allowed.has(body.status)) {
      return new Response(JSON.stringify({
        error: `status must be one of ${[...allowed].join(", ")} (pending is server-computed)`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data, error } = await supabase.rpc("finalize_sync_report", {
      _headset_id: claims.sub,
      _report_id: body.report_id,
      _status: body.status,
      _applied_manifest_version: body.applied_manifest_version ?? null,
      _downloaded_count: body.downloaded_count ?? 0,
      _failed_count: body.failed_count ?? 0,
      _deleted_count: body.deleted_count ?? 0,
      _total_bytes: body.total_bytes ?? 0,
      _error_message: body.error_message ?? null,
      _details: (body.details ?? null) as Record<string, unknown> | null,
      _playlist_id: body.playlist_id ?? null,
      _remote_video_count: body.remote_video_count ?? null,
      _local_video_count: body.local_video_count ?? null,
      _visible_video_count: body.visible_video_count ?? null,
      _cause: body.cause ?? null,
      _client_cycle_id: body.client_cycle_id ?? null,
    });
    if (error || !data) {
      console.error("finalize_sync_report error", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = data as {
      ok?: boolean;
      report_stored?: boolean;
      applied_updated?: boolean;
      accepted_applied_manifest_version?: number;
      server_desired_manifest_version?: number;
      server_previous_applied_manifest_version?: number;
      reason?: string;
      error?: string;
    };

    if (result.error === "invalid_report_id" || result.reason === "invalid_report_id") {
      return new Response(JSON.stringify({
        ok: false,
        report_stored: false,
        applied_updated: false,
        reason: "invalid_report_id",
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (result.reason === "headset_not_found") {
      return new Response(JSON.stringify({
        ok: false,
        report_stored: result.report_stored ?? false,
        applied_updated: false,
        reason: "headset_not_found",
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(
      `[SyncReport] headset=${claims.sub} applied_updated=${result.applied_updated} reason=${result.reason}`,
    );
    console.log(`[HeadsetContact] headset_id=${claims.sub} source=sync_report`);

    return new Response(JSON.stringify({
      ok: result.ok !== false,
      report_stored: result.report_stored ?? false,
      applied_updated: result.applied_updated ?? false,
      accepted_applied_manifest_version: result.accepted_applied_manifest_version ?? 0,
      server_desired_manifest_version: result.server_desired_manifest_version ?? 0,
      server_previous_applied_manifest_version: result.server_previous_applied_manifest_version ?? 0,
      reason: result.reason ?? "skipped",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown phase" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
