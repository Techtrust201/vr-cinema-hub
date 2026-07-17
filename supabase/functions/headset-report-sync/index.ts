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
    if (body.status && body.status === "pending") {
      return new Response(JSON.stringify({
        error: "pending is a server-computed state, not a report status",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data, error } = await supabase
      .from("sync_reports")
      .insert({
        headset_id: claims.sub,
        status: "started",
        cause: body.cause ?? null,
      })
      .select("id")
      .single();
    await supabase
      .from("headsets")
      .update({ last_sync_status: "started", last_sync_at: new Date().toISOString() })
      .eq("id", claims.sub);
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
    const allowed = new Set(["success", "partial", "failed", "no_change"]);
    if (!allowed.has(body.status)) {
      return new Response(JSON.stringify({
        error: `status must be one of ${[...allowed].join(", ")} (pending is server-computed)`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const nowIso = new Date().toISOString();

    // Ownership + existence check BEFORE mutating applied_manifest_version.
    const { data: existingReport, error: findReportErr } = await supabase
      .from("sync_reports")
      .select("id, headset_id, status, finished_at")
      .eq("id", body.report_id)
      .eq("headset_id", claims.sub)
      .maybeSingle();
    if (findReportErr) {
      console.error("sync_reports lookup error", findReportErr);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!existingReport) {
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
    if (existingReport.finished_at && existingReport.status !== "started") {
      return new Response(JSON.stringify({
        ok: true,
        report_stored: false,
        applied_updated: false,
        reason: "report_already_finished",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: updatedRows, error } = await supabase
      .from("sync_reports")
      .update({
        status: body.status,
        finished_at: nowIso,
        downloaded_count: body.downloaded_count ?? 0,
        failed_count: body.failed_count ?? 0,
        deleted_count: body.deleted_count ?? 0,
        total_bytes: body.total_bytes ?? 0,
        error_message: body.error_message ?? null,
        details: (body.details ?? null) as Record<string, unknown> | null,
        applied_manifest_version: body.applied_manifest_version ?? null,
        playlist_id: body.playlist_id ?? null,
        remote_video_count: body.remote_video_count ?? null,
        local_video_count: body.local_video_count ?? null,
        visible_video_count: body.visible_video_count ?? null,
      })
      .eq("id", body.report_id)
      .eq("headset_id", claims.sub)
      .select("id");
    if (error) {
      console.error("sync_reports update error", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const reportStored = Array.isArray(updatedRows) && updatedRows.length > 0;
    if (!reportStored) {
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

    // Update headset.applied_manifest_version ONLY on success / no_change
    // AND when the reported version passes ALL these checks:
    //   - integer > 0
    //   - >= current applied (no rollback)
    //   - <= desired (no inventing a higher version than what we served)
    //   - matches a row in manifest_versions(headset_id, version) we previously served
    const { data: cur } = await supabase
      .from("headsets")
      .select("applied_manifest_version, desired_manifest_version")
      .eq("id", claims.sub)
      .maybeSingle();
    if (!cur) {
      return new Response(JSON.stringify({
        ok: false,
        report_stored: true,
        applied_updated: false,
        reason: "headset_not_found",
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const previousApplied = cur.applied_manifest_version ?? 0;
    const serverDesired = cur.desired_manifest_version ?? 0;
    const headsetUpdate: Record<string, unknown> = {
      last_sync_status: body.status,
      last_sync_at: nowIso,
      last_seen_at: nowIso,
      last_contact_source: "sync_report",
    };
    let reason = "skipped";
    let appliedUpdated = false;
    let acceptedApplied = previousApplied;

    if ((body.status === "success" || body.status === "no_change") &&
        typeof body.applied_manifest_version === "number" &&
        Number.isInteger(body.applied_manifest_version) &&
        body.applied_manifest_version > 0) {
      const reported = body.applied_manifest_version;
      if (reported < previousApplied) {
        reason = "rollback";
      } else if (reported > serverDesired) {
        reason = "above_desired";
      } else {
        const { data: snap } = await supabase
          .from("manifest_versions")
          .select("version")
          .eq("headset_id", claims.sub)
          .eq("version", reported)
          .maybeSingle();
        if (!snap) {
          reason = "unknown_version";
        } else {
          headsetUpdate.applied_manifest_version = reported;
          appliedUpdated = true;
          acceptedApplied = reported;
          reason = "ok";
        }
      }
    } else if (body.status === "success" || body.status === "no_change") {
      reason = "missing_applied_manifest_version";
    } else {
      reason = "invalid_status";
    }

    await supabase.from("headsets").update(headsetUpdate).eq("id", claims.sub);
    console.log(`[HeadsetContact] headset_id=${claims.sub} source=sync_report`);

    if (appliedUpdated) {
      console.log(`[SyncReport] applied version updated headset=${claims.sub} version=${acceptedApplied}`);
    } else {
      console.log(`[SyncReport] report stored but applied unchanged headset=${claims.sub} reported=${body.applied_manifest_version} reason=${reason}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      report_stored: true,
      applied_updated: appliedUpdated,
      accepted_applied_manifest_version: acceptedApplied,
      server_desired_manifest_version: serverDesired,
      server_previous_applied_manifest_version: previousApplied,
      reason,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown phase" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});