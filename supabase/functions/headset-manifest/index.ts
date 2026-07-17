import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders, extractBearer, verifyDeviceToken } from "../_shared/device-jwt.ts";

// Called by the Quest app on every sync cycle.
// v3: returns a versioned manifest. The headset MUST echo back the
// `manifest_version` in headset-report-sync once it has fully applied it
// (downloaded all files and refreshed its library).

const SIGNED_URL_TTL_SECONDS = 15 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Make sure the headset still exists and is active.
  const { data: headset, error: hErr } = await supabase
    .from("headsets")
    .select("id, status, desired_manifest_version, applied_manifest_version, last_manifest_cause")
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

  // Update last_seen + last_manifest_at + contact provenance
  const nowIso = new Date().toISOString();
  await supabase
    .from("headsets")
    .update({
      last_seen_at: nowIso,
      last_manifest_at: nowIso,
      last_contact_source: "manifest",
    })
    .eq("id", headset.id);
  console.log(`[HeadsetContact] headset_id=${headset.id} source=manifest`);

  const desiredVersion: number = headset.desired_manifest_version ?? 0;

  // Optional short-circuit: if the headset tells us the version it already
  // has and it matches what we'd serve, return 304 to skip URL signing.
  // Accepts If-None-Match as: 42, "42", W/"42". Falls back to ?known_version=N.
  const url = new URL(req.url);
  const rawEtag = req.headers.get("If-None-Match") ?? url.searchParams.get("known_version") ?? "";
  const cleanedEtag = rawEtag.replace(/^W\//, "").replace(/^"(.*)"$/, "$1").trim();
  const knownVersion = Number(cleanedEtag);
  const forceFullParam = (url.searchParams.get("force_full") ?? url.searchParams.get("force") ?? "").toLowerCase();
  const forceFull = forceFullParam === "1" || forceFullParam === "true";
  console.log(JSON.stringify({
    fn: "headset-manifest", phase: "decide",
    headset_id: headset.id,
    known_version_raw: rawEtag,
    known_version_parsed: knownVersion,
    force_full: forceFull,
    desired_version: desiredVersion,
    will_return_304: !forceFull && Number.isFinite(knownVersion) && knownVersion > 0 && knownVersion === desiredVersion,
  }));
  if (!forceFull && Number.isFinite(knownVersion) && knownVersion > 0 && knownVersion === desiredVersion) {
    console.log(JSON.stringify({
      fn: "headset-manifest",
      headset_id: headset.id,
      served: "304",
      manifest_version: desiredVersion,
    }));
    console.log(`[headset-manifest] served_version=${desiredVersion} final_videos=0 (304)`);
    return new Response(null, {
      status: 304,
      headers: { ...corsHeaders, "ETag": `"${desiredVersion}"` },
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

  // Deterministic playlist order.
  playlistIds.sort();

  type PvRow = {
    playlist_id: string;
    video_id: string;
    position: number | null;
    videos: {
      id: string;
      name: string;
      storage_path: string | null;
      size_bytes: number | null;
      duration_seconds: number | null;
      format: string | null;
      projection: string | null;
      stereo_mode: string | null;
      updated_at: string | null;
    } | null;
  };

  let videoRows: PvRow[] = [];
  if (playlistIds.length > 0) {
    const { data: pvideos, error: pvErr } = await supabase
      .from("playlist_videos")
      .select("playlist_id, video_id, position, videos(id, name, storage_path, size_bytes, duration_seconds, format, projection, stereo_mode, updated_at)")
      .in("playlist_id", playlistIds)
      .order("position", { ascending: true });
    if (pvErr) {
      console.error("playlist_videos fetch error", pvErr);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    videoRows = (pvideos ?? []) as unknown as PvRow[];
  }

  console.log(JSON.stringify({
    fn: "headset-manifest",
    headset_id: headset.id,
    playlist_video_rows: videoRows.length,
  }));

  // Dedup by video_id (first occurrence by playlist order + position wins).
  const seen = new Set<string>();
  type ManifestVideoOut = Record<string, unknown>;
  const videos: ManifestVideoOut[] = [];
  for (const row of videoRows) {
    const v = row.videos;
    if (!v || seen.has(v.id)) continue;
    seen.add(v.id);

    let download_url: string | null = null;
    if (v.storage_path) {
      const { data: signed, error: signErr } = await supabase
        .storage
        .from("videos")
        .createSignedUrl(v.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signErr || !signed?.signedUrl) {
        console.error("signed url failed", { path: v.storage_path, signErr });
        return new Response(JSON.stringify({ error: "Signed URL generation failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      download_url = signed.signedUrl;
    }

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
    playlist_ids: playlistIds,
  }));

  // playlist_id kept for compatibility (first sorted id); playlist_ids is the truth.
  const playlistId = playlistIds[0] ?? null;
  const payload = {
    manifest_version: desiredVersion,
    schema_version: 3,
    headset_id: headset.id,
    playlist_id: playlistId,
    playlist_ids: playlistIds,
    generated_at: nowIso,
    updated_at: nowIso,
    url_expires_in: SIGNED_URL_TTL_SECONDS,
    videos,
  };

  // Snapshot for audit. Canonical payload: NO signed urls (they expire).
  // Never serve a version that could not be archived when desired > 0.
  if (desiredVersion > 0) {
    const { error: snapErr } = await supabase
      .from("manifest_versions")
      .upsert({
        headset_id: headset.id,
        version: desiredVersion,
        playlist_id: playlistId,
        cause: headset.last_manifest_cause ?? null,
        payload: {
          ...payload,
          videos: videos.map((v) => {
            const { url: _u, download_url: _d, ...rest } = v;
            return rest;
          }),
        },
      }, { onConflict: "headset_id,version" });
    if (snapErr) {
      console.error("manifest_versions upsert failed", snapErr);
      return new Response(JSON.stringify({ error: "Manifest snapshot failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await supabase.from("headsets").update({ last_manifest_cause: null }).eq("id", headset.id);
  }

  console.log(`[headset-manifest] served_version=${desiredVersion} final_videos=${videos.length}`);

  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "ETag": `"${desiredVersion}"` },
  });
});