import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  corsHeaders,
  deviceTokenVersionIsCurrent,
  extractBearer,
  verifyDeviceToken,
} from "../_shared/device-jwt.ts";
import { getSecretKey } from "../_shared/supabase-keys.ts";
import { signedDiskDownloadUrl } from "../_shared/disk-origin.ts";
import { signedR2DownloadUrl } from "../_shared/r2.ts";

// Called by the Quest app on every sync cycle.
// v3: returns a versioned manifest. The headset MUST echo back the
// `manifest_version` in headset-report-sync once it has fully applied it
// (downloaded all files and refreshed its library).

const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

/**
 * Une vidéo porte l'origine de ses octets (`videos.origin`), pas l'installation :
 * une flotte peut donc être migrée vers R2 film par film, sans coupure et sans
 * toucher aux casques déjà synchronisés.
 */
async function signedObjectUrl(origin: string | null | undefined, path: string): Promise<string | null> {
  if (!path) return null;
  if (origin === "r2") return await signedR2DownloadUrl(path, SIGNED_URL_TTL_SECONDS);
  if (origin === "disk") return await signedDiskDownloadUrl(path, SIGNED_URL_TTL_SECONDS);
  return null;
}

async function resolveThumbnailUrl(
  v: { origin?: string | null; thumbnail_url: string | null },
  storageSigned: Map<string, string>,
): Promise<string | null> {
  if (!v.thumbnail_url) return null;
  if (v.thumbnail_url.startsWith("http://") || v.thumbnail_url.startsWith("https://")) {
    return v.thumbnail_url;
  }
  const fromBucket = storageSigned.get(v.thumbnail_url);
  if (fromBucket) return fromBucket;
  // Les films hors bucket Storage (plafond 50 Mo en offre gratuite) rangent leur
  // miniature à côté du mp4, dans la même origine.
  return await signedObjectUrl(v.origin, v.thumbnail_url);
}

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
    getSecretKey(),
  );

  // Make sure the headset still exists and is active.
  const { data: headset, error: hErr } = await supabase
    .from("headsets")
    .select(
      "id, status, desired_manifest_version, applied_manifest_version, last_manifest_cause, " +
        "last_error_code, token_version",
    )
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
  // Un jeton émis avant le dernier appairage ou la dernière révocation n'a plus cours.
  if (!deviceTokenVersionIsCurrent(claims, headset.token_version)) {
    console.error("stale device token refused", {
      headset_id: headset.id,
      token_version: claims.tv ?? 0,
      current_version: headset.token_version,
    });
    return new Response(JSON.stringify({ error: "Token superseded" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update last_seen + last_manifest_at + contact provenance
  const nowIso = new Date().toISOString();
  const { error: touchErr } = await supabase
    .from("headsets")
    .update({
      last_seen_at: nowIso,
      last_manifest_at: nowIso,
      last_contact_source: "manifest",
    })
    .eq("id", headset.id);
  if (touchErr) {
    console.error("headset touch error", touchErr);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
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
  const { data: groups, error: groupsErr } = await supabase
    .from("headset_group_members")
    .select("group_id")
    .eq("headset_id", headset.id);
  if (groupsErr) {
    console.error("headset_group_members fetch error", groupsErr);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
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
      origin?: string | null;
      thumbnail_url: string | null;
      size_bytes: number | null;
      duration_seconds: number | null;
      format: string | null;
      projection: string | null;
      stereo_mode: string | null;
      source_layout: string | null;
      updated_at: string | null;
      sha256: string | null;
    } | null;
  };

  let videoRows: PvRow[] = [];
  if (playlistIds.length > 0) {
    const { data: pvideos, error: pvErr } = await supabase
      .from("playlist_videos")
      .select("playlist_id, video_id, position, videos(id, name, storage_path, origin, thumbnail_url, size_bytes, duration_seconds, format, projection, stereo_mode, source_layout, updated_at, sha256)")
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

  // Les miniatures sont signées en un seul appel. Signer dans la boucle doublerait le nombre
  // d'allers-retours du manifeste, que chaque casque redemande à chaque vérification de sync.
  // Un échec n'est jamais bloquant : la miniature n'est qu'un confort d'affichage.
  const thumbnailUrls = new Map<string, string>();
  const thumbnailPaths = [
    ...new Set(
      videoRows
        .map((row) => row.videos?.thumbnail_url)
        .filter((path): path is string => !!path),
    ),
  ];
  if (thumbnailPaths.length > 0) {
    const { data: signedThumbs, error: thumbErr } = await supabase
      .storage
      .from("thumbnails")
      .createSignedUrls(thumbnailPaths, SIGNED_URL_TTL_SECONDS);
    if (thumbErr) {
      console.error("thumbnail signed urls failed", { count: thumbnailPaths.length, thumbErr });
    }
    for (const entry of signedThumbs ?? []) {
      if (entry.path && entry.signedUrl) thumbnailUrls.set(entry.path, entry.signedUrl);
    }
  }

  // Dedup by video_id (first occurrence by playlist order + position wins).
  const seen = new Set<string>();
  type ManifestVideoOut = Record<string, unknown>;
  const videos: ManifestVideoOut[] = [];
  let skippedUnsigned = 0;
  for (const row of videoRows) {
    const v = row.videos;
    if (!v || seen.has(v.id)) continue;
    seen.add(v.id);

    let download_url: string | null = null;
    if (v.origin === "disk" || v.origin === "r2") {
      download_url = await signedObjectUrl(v.origin, v.storage_path ?? "");
      if (!download_url) {
        console.error("object origin url failed", {
          origin: v.origin,
          path: v.storage_path,
          video_id: v.id,
        });
        skippedUnsigned += 1;
        continue;
      }
    } else if (v.storage_path) {
      const { data: signed, error: signErr } = await supabase
        .storage
        .from("videos")
        .createSignedUrl(v.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signErr || !signed?.signedUrl) {
        console.error("signed url failed", { path: v.storage_path, video_id: v.id, signErr });
        skippedUnsigned += 1;
        continue;
      }
      download_url = signed.signedUrl;
    } else {
      console.error("manifest video missing storage_path", { video_id: v.id });
      skippedUnsigned += 1;
      continue;
    }

    const thumbnail_url = await resolveThumbnailUrl(v, thumbnailUrls);

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
      thumbnail_url,
      order: row.position ?? 0,
      updated_at: v.updated_at ?? null,
      file_extension,
      projection: v.projection,
      stereo_mode: v.stereo_mode,
      // Le casque en a besoin pour savoir comment les pixels recouvrent la sphère : un cubemap
      // lu comme une mappemonde s'afficherait disloqué.
      source_layout: v.source_layout,
      legacy_format: v.format,
      format: v.format,
      size_bytes: v.size_bytes,
      duration_seconds: v.duration_seconds,
      sha256: v.sha256 ?? null,
    });
  }

  // Un manifeste incomplet est plus dangereux qu'un manifeste refusé.
  //
  // Servir les vidéos restantes en HTTP 200 laissait le casque croire qu'il avait tout
  // reçu : il téléchargeait le reste, annonçait une synchronisation réussie, et le
  // tableau de bord affichait « Contenu à jour » alors qu'un film manquait. La panne ne
  // se découvrait que devant les spectateurs.
  //
  // Refuser tout le manifeste est le comportement sûr : le casque conserve le contenu
  // qu'il avait déjà, signale un échec, et l'exploitant voit qu'il doit intervenir. La
  // cause est écrite sur la fiche du casque pour qu'elle soit lisible sans consulter les
  // traces du serveur — sans quoi refuser reviendrait à bloquer la flotte en silence.
  if (skippedUnsigned > 0) {
    console.error("manifest incomplete, refusing to serve", {
      headset_id: headset.id,
      skipped: skippedUnsigned,
      signable: videos.length,
      expected: seen.size,
    });

    await supabase
      .from("headsets")
      .update({
        last_error_code: "manifest_incomplete",
        last_error_message:
          `${skippedUnsigned} film(s) sur ${seen.size} sont introuvables dans le stockage. ` +
          `Retirez-les de la playlist ou renvoyez-les, puis relancez la mise à jour.`,
      })
      .eq("id", headset.id);

    return new Response(
      JSON.stringify({
        error: "Manifest incomplete",
        missing_videos: skippedUnsigned,
        expected_videos: seen.size,
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log(JSON.stringify({
    fn: "headset-manifest",
    headset_id: headset.id,
    served_version: desiredVersion,
    final_videos: videos.length,
    skipped_unsigned: skippedUnsigned,
    playlist_ids: playlistIds,
  }));

  // Le manifeste est complet : effacer un refus précédent, sans quoi le tableau de bord
  // afficherait indéfiniment une panne déjà résolue.
  if (headset.last_error_code === "manifest_incomplete") {
    await supabase
      .from("headsets")
      .update({ last_error_code: null, last_error_message: null })
      .eq("id", headset.id);
  }

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
            const { url: _u, download_url: _d, thumbnail_url: _t, ...rest } = v;
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
    const { error: clearCauseErr } = await supabase
      .from("headsets")
      .update({ last_manifest_cause: null })
      .eq("id", headset.id);
    if (clearCauseErr) {
      console.error("clear last_manifest_cause failed", clearCauseErr);
      // Snapshot already stored — do not fail the serve, but surface the error.
    }
  }

  console.log(`[headset-manifest] served_version=${desiredVersion} final_videos=${videos.length}`);

  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json", "ETag": `"${desiredVersion}"` },
  });
});