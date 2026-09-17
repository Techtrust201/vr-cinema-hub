import { corsHeaders } from "../_shared/device-jwt.ts";
import {
  deleteDiskObject,
  diskOriginConfigured,
  signedDiskDownloadUrl,
  signedDiskUploadToken,
} from "../_shared/disk-origin.ts";
import {
  abortR2MultipartUpload,
  completeR2MultipartUpload,
  createR2MultipartUpload,
  deleteR2Object,
  presignR2,
  r2Configured,
  signedR2DownloadUrl,
} from "../_shared/r2.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { getPublishableKey, getSecretKey } from "../_shared/supabase-keys.ts";

// Délivre les accès au stockage d'objets pour le dashboard.
//
// Deux origines cohabitent volontairement : R2 (cible, indépendante de toute
// machine allumée) et le nœud disque derrière tunnel (historique). Tant que des
// vidéos pointent encore vers le disque, elles doivent rester lisibles, d'où
// l'aiguillage par `origin` en lecture et par configuration en écriture.

// Un PUT unique de 900 Mo repart de zéro à la moindre coupure : on découpe.
const PART_BYTES = 32 * 1024 * 1024;
// S3 plafonne un envoi multipart à 10 000 morceaux.
const MAX_PARTS = 10_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function partPlan(size: number): { partBytes: number; partCount: number } {
  let partBytes = PART_BYTES;
  while (Math.ceil(size / partBytes) > MAX_PARTS) partBytes *= 2;
  return { partBytes, partCount: Math.max(1, Math.ceil(size / partBytes)) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const r2 = r2Configured();
  const disk = diskOriginConfigured();
  if (!r2 && !disk) {
    return json({ error: "Aucun stockage d'objets configuré (R2 ni origine disque)." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  let body: {
    path?: string;
    download?: boolean;
    remove?: boolean;
    origin?: string;
    size?: number;
    contentType?: string;
    complete?: { uploadId?: string; parts?: { partNumber: number; etag: string }[] };
    abort?: { uploadId?: string };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const path = (body.path ?? "").trim();
  if (!path || path.includes("..") || path.startsWith("/")) {
    return json({ error: "Chemin invalide" }, 400);
  }

  // Le chemin doit désigner une des deux bibliothèques de l'application.
  //
  // Sans ce garde-fou, un chemin quelconque — deviné ou forgé — pouvait être signé ou
  // supprimé dans tout le bucket. Vérifier l'existence en base était impossible : le
  // dashboard efface la ligne avant le fichier, et un envoi interrompu nettoie un
  // fichier qui n'a jamais eu de ligne. Contraindre la forme du chemin protège les deux
  // cas sans gêner aucun usage légitime.
  if (!/^(location|animation)\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path)) {
    return json({ error: "Chemin hors des bibliothèques autorisées" }, 400);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getPublishableKey(),
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.slice(7);
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, getSecretKey());
  const { data: actorRole, error: roleErr } = await admin.rpc("get_user_role", {
    _user_id: userData.user.id,
  });
  if (roleErr || (actorRole !== "owner" && actorRole !== "admin" && actorRole !== "operator")) {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    // Lecture : l'origine vient de la vidéo, pas de la configuration courante,
    // sinon les films restés sur le disque deviendraient illisibles après bascule.
    if (body.download) {
      const origin = body.origin ?? (r2 ? "r2" : "disk");
      const url = origin === "r2" ? await signedR2DownloadUrl(path) : await signedDiskDownloadUrl(path);
      if (!url) throw new Error(`Origine « ${origin} » non configurée`);
      return json({ url, origin });
    }

    // Suppression : sans elle, effacer une vidéo dans le dashboard laisserait le
    // fichier occuper la place — et le quota — indéfiniment.
    if (body.remove) {
      const origin = body.origin ?? (r2 ? "r2" : "disk");
      if (origin === "r2") await deleteR2Object(path);
      else await deleteDiskObject(path);
      return json({ ok: true, origin });
    }

    // Envoi interrompu : les morceaux déjà déposés restent facturés tant qu'ils ne sont
    // pas abandonnés. Un film annulé en cours de route laissait plusieurs centaines de
    // mégaoctets invisibles dans le bucket, sans aucun moyen de les retrouver.
    if (body.abort?.uploadId) {
      await abortR2MultipartUpload(path, body.abort.uploadId);
      return json({ ok: true, origin: "r2" });
    }

    // Finalisation d'un envoi multipart R2.
    if (body.complete) {
      const { uploadId, parts } = body.complete;
      if (!uploadId || !Array.isArray(parts) || parts.length === 0) {
        return json({ error: "Finalisation invalide : uploadId ou parts manquants." }, 400);
      }
      await completeR2MultipartUpload({ key: path, uploadId, parts });
      return json({ ok: true, origin: "r2" });
    }

    if (r2) {
      const size = Number(body.size ?? 0);
      if (!Number.isFinite(size) || size <= 0) {
        return json({ error: "Taille de fichier manquante pour l'envoi R2." }, 400);
      }
      const contentType = body.contentType || "application/octet-stream";

      // Un petit fichier (miniature) ne justifie pas un multipart : un PUT direct
      // évite trois allers-retours réseau pour 60 Ko.
      if (size <= PART_BYTES) {
        const url = await presignR2({ method: "PUT", key: path, ttlSeconds: 6 * 60 * 60 });
        return json({ mode: "r2-single", origin: "r2", url, contentType });
      }

      const { partBytes, partCount } = partPlan(size);
      const { uploadId, partUrls } = await createR2MultipartUpload({ key: path, contentType, partCount });
      return json({ mode: "r2-multipart", origin: "r2", uploadId, partUrls, partBytes });
    }

    const signed = await signedDiskUploadToken(path);
    return json({ mode: "disk", origin: "disk", ...signed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "stockage indisponible";
    console.error("origin-upload-url", { path, message });
    return json({ error: message }, 503);
  }
});
