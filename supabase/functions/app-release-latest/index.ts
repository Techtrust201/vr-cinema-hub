import { corsHeaders } from "../_shared/device-jwt.ts";
import { presignR2, r2Configured } from "../_shared/r2.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { getPublishableKey, getSecretKey } from "../_shared/supabase-keys.ts";

// Délivre le lien de téléchargement de la dernière application casque publiée.
//
// Le chemin du fichier vient de la base, jamais de la requête : le dashboard ne peut obtenir
// une URL signée que pour un APK que scripts/release-headset-app.sh a effectivement publié.

const DOWNLOAD_FILE_NAME = "DLPAlexandre.apk";

// R2 ne vérifie l'expiration qu'au début de la requête : quelques minutes suffisent même pour
// une connexion lente, et un lien recopié ailleurs cesse vite de servir.
const URL_TTL_SECONDS = 15 * 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getPublishableKey(),
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.slice(7));
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, getSecretKey());
  const { data: actorRole, error: roleErr } = await admin.rpc("get_user_role", {
    _user_id: userData.user.id,
  });
  if (roleErr || (actorRole !== "owner" && actorRole !== "admin" && actorRole !== "operator")) {
    return json({ error: "Forbidden" }, 403);
  }

  const { data: release, error: releaseErr } = await admin
    .from("app_releases")
    .select("version_name, version_code, storage_path, size_bytes, sha256, notes, created_at")
    .order("version_code", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (releaseErr) {
    console.error("app_releases read failed", releaseErr);
    return json({ error: "Lecture des versions impossible" }, 500);
  }
  if (!release) return json({ error: "Aucune version publiée" }, 404);

  if (!r2Configured()) return json({ error: "Stockage R2 non configuré" }, 503);

  try {
    const url = await presignR2({
      method: "GET",
      key: release.storage_path,
      ttlSeconds: URL_TTL_SECONDS,
      query: {
        // Le navigateur enregistre le fichier sous ce nom, quel que soit son nom sur R2.
        "response-content-disposition": `attachment; filename="${DOWNLOAD_FILE_NAME}"`,
        "response-content-type": "application/vnd.android.package-archive",
      },
    });
    const { storage_path: _path, ...publicRelease } = release;
    return json({ release: publicRelease, url, file_name: DOWNLOAD_FILE_NAME });
  } catch (e) {
    console.error("app release presign failed", e);
    return json({ error: "Lien de téléchargement indisponible" }, 500);
  }
});
