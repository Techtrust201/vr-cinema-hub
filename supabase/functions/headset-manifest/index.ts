import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders, extractBearer, verifyDeviceToken } from "../_shared/device-jwt.ts";

// Called by the Quest app on every sync cycle.
// v3: returns a versioned manifest. The headset MUST echo back the
// `manifest_version` in headset-report-sync once it has fully applied it
// (downloaded all files and refreshed its library).

const SIGNED_URL_TTL_SECONDS = 15 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Make sure the headset still exists and is active.
  const { data: headset, error: hErr } = await supabase
    .from("headsets")
    .select("id, status, desired_manifest_version, applied_manifest_version")
    .eq("id", claims.sub)
    .maybeSingle();
  if (hErr || !headset) {
    return new Response(JSON.stringify({ error: "Headset not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (headset.status !== "active") {
    return new Response(JSON.stringify({ error: "Headset revoked" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update last_seen + last_manifest_at
  const nowIso = new Date().toISOString();
  await supabase
    .from("headsets")
    .update({ last_seen_at: nowIso, last_manifest_at: nowIso })
    .eq("id", headset.id);

  const desiredVersion: number = headset.desired_manifest_version ?? 0;

  // Optional short-circuit: if the headset tells us the version it already
  // has and it matches what we'd serve, return 304 to skip URL signing.
  const url = new URL(req.url);
  const knownVersion = Number(
    req.headers.get("If-None-Match") ?? url.searchParams.get("known_version") ?? "",
  );
  if (Number.isFinite(knownVersion) && knownVersion > 0 && knownVersion === desiredVersion) {
    console.log(JSON.stringify({
      fn: "headset-manifest",
      headset_id: headset.id,
      served: "304",
      manifest_version: desiredVersion,
    }));
    return new Response(null, {
      status: 304,
      headers: { ...corsHeaders, "ETag": String(desiredVersion) },
    });
  }

  // Collect group IDs this headset belongs to.
  const { data: groups } = await supabase
    .from("headset_group_members")
    .select("group_id")
    .eq("headset_id", headset.id);
  const groupIds = (groups ?? []).map((g) => g.group_id);

  // Fetch assignments that target: this headset, one of its groups, or 'all'.
  const filters: string[] = [`and(target_type.eq.all)`];
  filters.push(`and(target_type.eq.headset,target_id.eq.${headset.id})`);
  if (groupIds.length > 0) {
    const list = groupIds.map((id) => `"${id}"`).join(",");
    filters.push(`and(target_type.eq.group,target_id.in.(${list}))`);
  }

  const { data: assignments, error: aErr } = await supabase
    .from("assignments")
    .select("playlist_id")
    .or(filters.join(","));

  if (aErr) {
    console.error("assignments fetch error", aErr);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const playlistIds = Array.from(new Set((assignments ?? []).map((a) => a.playlist_id)));

  console.log(JSON.stringify({
    fn: "headset-manifest",
    headset_id: headset.id,
    groups: groupIds.length,
    assignments: assignments?.length ?? 0,
    playlists: playlistIds.length,
    desired_version: desiredVersion,
    applied_version: headset.applied_manifest_version ?? 0,
  }));

  let videoRows: any[] = [];
  if (playlistIds.length > 0) {
    const { data: pvideos } = await supabase
      .from("playlist_videos")
      .select("playlist_id, video_id, position, videos(id, name, storage_path, size_bytes, duration_seconds, format, projection, stereo_mode, updated_at)")
      .in("playlist_id", playlistIds)
      .order("position", { ascending: true });
    videoRows = pvideos ?? [];
  }

  console.log(JSON.stringify({
    fn: "headset-manifest",
    headset_id: headset.id,
    playlist_video_rows: videoRows.length,
  }));

  // Dedup by video_id.
  const seen = new Set<string>();
  const videos: any[] = [];
  for (const row of videoRows) {
    const v = row.videos;
    if (!v || seen.has(v.id)) continue;
    seen.add(v.id);

    let download_url: string | null = null;
    if (v.storage_path) {
      const { data: signed } = await supabase
        .storage
        .from("videos")
        .createSignedUrl(v.storage_path, SIGNED_URL_TTL_SECONDS);
      download_url = signed?.signedUrl ?? null;
    }

    // Real container extension from storage_path (NOT from format).
    const pathLower = (v.storage_path ?? "").toLowerCase();
    const dot = pathLower.lastIndexOf(".");
    const ext = dot >= 0 ? pathLower.slice(dot + 1) : "";
    const allowed = new Set(["mp4", "mov", "m4v", "webm", "mkv"]);
    const file_extension = allowed.has(ext) ? ext : "mp4";

    videos.push({
      id: v.id,
      name: v.name,
      url: download_url,
      download_url,
      order: row.position ?? 0,
      updated_at: v.updated_at ?? null,
      file_extension,
      projection: v.projection,
      stereo_mode: v.stereo_mode,
      legacy_format: v.format,
      format: v.format,
      size_bytes: v.size_bytes,
      duration_seconds: v.duration_seconds,
    });
  }

  console.log(JSON.stringify({
    fn: "headset-manifest",
    headset_id: headset.id,
    served_version: desiredVersion,
    final_videos: videos.length,
    breakdown: videos.map((v) => ({
      id: v.id,
      projection: v.projection,
      stereo_mode: v.stereo_mode,
      file_extension: v.file_extension,
      legacy_format: v.legacy_format,
    })),
  }));

  const playlistId = playlistIds[0] ?? null;
  const payload = {
    manifest_version: desiredVersion,
    schema_version: 3,
    headset_id: headset.id,
    playlist_id: playlistId,
    generated_at: nowIso,
    updated_at: nowIso,
    url_expires_in: SIGNED_URL_TTL_SECONDS,
    videos,
  };

  // Snapshot for audit. Ignore conflicts (same version already stored).
  if (desiredVersion > 0) {
    await supabase
      .from("manifest_versions")
      .upsert({
        headset_id: headset.id,
        version: desiredVersion,
        playlist_id: playlistId,
        payload: { ...payload, videos: videos.map((v) => ({ ...v, url: undefined, download_url: undefined })) },
      }, { onConflict: "headset_id,version" });
  }

  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "ETag": String(desiredVersion) },
  });
});