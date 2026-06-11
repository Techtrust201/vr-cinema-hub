import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders, extractBearer, verifyDeviceToken } from "../_shared/device-jwt.ts";

// Called by the Quest app on every sync cycle. Returns the list of videos
// this headset should have locally, with short-lived signed download URLs.

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
    .select("id, status")
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

  // Update last_seen
  await supabase
    .from("headsets")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", headset.id);

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

  let videoRows: any[] = [];
  if (playlistIds.length > 0) {
    const { data: pvideos } = await supabase
      .from("playlist_videos")
      .select("video_id, position, videos(id, title, storage_path, size_bytes, checksum, content_type)")
      .in("playlist_id", playlistIds);
    videoRows = pvideos ?? [];
  }

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

    videos.push({
      id: v.id,
      title: v.title,
      size_bytes: v.size_bytes,
      checksum: v.checksum,
      content_type: v.content_type,
      download_url,
    });
  }

  return new Response(
    JSON.stringify({
      headset_id: headset.id,
      generated_at: new Date().toISOString(),
      url_expires_in: SIGNED_URL_TTL_SECONDS,
      videos,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});