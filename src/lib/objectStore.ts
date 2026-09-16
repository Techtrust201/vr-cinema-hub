import { supabase } from "@/integrations/supabase/client";

// Envoi et lecture des gros fichiers, hors bucket Supabase Storage (plafonné à
// 50 Mo en offre gratuite, là où un film pèse près d'un gigaoctet).
//
// Deux stockages sont possibles : Cloudflare R2, et le nœud disque derrière un
// tunnel. C'est l'Edge Function qui tranche, jamais le navigateur : une variable
// `VITE_…` de plus serait une chose à synchroniser entre Vercel et Supabase, donc
// une panne de plus le jour où quelqu'un oublie de la mettre à jour.

export type ObjectOrigin = "r2" | "disk";

const DEFAULT_CHUNK = 32 * 1024 * 1024;

/** Aucun stockage d'objets n'est configuré : l'appelant peut se rabattre sur Storage. */
export class NoObjectStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoObjectStoreError";
  }
}

type UploadGrant =
  | { mode: "disk"; origin: "disk"; url: string; token: string; chunkBytes?: number }
  | { mode: "r2-single"; origin: "r2"; url: string; contentType: string }
  | { mode: "r2-multipart"; origin: "r2"; uploadId: string; partUrls: string[]; partBytes: number };

async function requestGrant(body: Record<string, unknown>): Promise<UploadGrant> {
  const { data, error } = await supabase.functions.invoke<UploadGrant & { error?: string }>(
    "origin-upload-url",
    { body },
  );
  if (error) {
    // L'Edge Function renvoie 503 quand rien n'est configuré : ce n'est pas une
    // panne, c'est une installation qui n'utilise que Supabase Storage.
    const detail = (data as { error?: string } | null)?.error ?? error.message;
    if (/aucun stockage/i.test(detail)) throw new NoObjectStoreError(detail);
    throw new Error(detail);
  }
  if (!data || (data as { error?: string }).error) {
    throw new Error((data as { error?: string })?.error ?? "Stockage injoignable.");
  }
  return data;
}

async function uploadDisk(
  grant: Extract<UploadGrant, { mode: "disk" }>,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const chunkBytes = grant.chunkBytes && grant.chunkBytes > 0 ? grant.chunkBytes : DEFAULT_CHUNK;
  const total = file.size;
  let sent = 0;
  while (sent < total) {
    if (signal?.aborted) throw new DOMException("Upload annulé", "AbortError");
    const end = Math.min(sent + chunkBytes, total);
    const res = await fetch(grant.url, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${grant.token}`,
        "content-type": "application/octet-stream",
        "content-range": `bytes ${sent}-${end - 1}/${total}`,
        "content-length": String(end - sent),
      },
      body: file.slice(sent, end),
      signal,
    });
    if (!res.ok) {
      throw new Error((await res.text().catch(() => "")) || `Origine disque : HTTP ${res.status}`);
    }
    sent = end;
    onProgress?.(sent / total);
  }
}

async function uploadR2Multipart(
  grant: Extract<UploadGrant, { mode: "r2-multipart" }>,
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const parts: { partNumber: number; etag: string }[] = [];
  for (let i = 0; i < grant.partUrls.length; i++) {
    if (signal?.aborted) throw new DOMException("Upload annulé", "AbortError");
    const start = i * grant.partBytes;
    const end = Math.min(start + grant.partBytes, file.size);
    const res = await fetch(grant.partUrls[i], {
      method: "PUT",
      body: file.slice(start, end),
      signal,
    });
    if (!res.ok) {
      throw new Error((await res.text().catch(() => "")) || `R2 : HTTP ${res.status} sur le morceau ${i + 1}`);
    }
    const etag = res.headers.get("etag");
    if (!etag) {
      // Le navigateur ne voit un en-tête de réponse que si CORS l'expose.
      throw new Error(
        "R2 n'expose pas l'en-tête ETag au navigateur. Ajoutez « ETag » à ExposeHeaders dans la configuration CORS du bucket.",
      );
    }
    parts.push({ partNumber: i + 1, etag });
    onProgress?.(end / file.size);
  }

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    "origin-upload-url",
    { body: { path, complete: { uploadId: grant.uploadId, parts } } },
  );
  if (error || !data?.ok) {
    throw new Error(data?.error ?? error?.message ?? "R2 : finalisation de l'envoi refusée.");
  }
}

/**
 * Envoie un fichier et rend l'origine réellement utilisée, à écrire dans
 * `videos.origin` pour que la lecture sache où retourner le chercher.
 */
export async function uploadToObjectStore(options: {
  path: string;
  file: File;
  contentType: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<ObjectOrigin> {
  const { path, file, contentType, onProgress, signal } = options;
  if (signal?.aborted) throw new DOMException("Upload annulé", "AbortError");

  const grant = await requestGrant({ path, size: file.size, contentType });

  if (grant.mode === "disk") {
    await uploadDisk(grant, file, onProgress, signal);
  } else if (grant.mode === "r2-single") {
    const res = await fetch(grant.url, {
      method: "PUT",
      headers: { "content-type": grant.contentType },
      body: file,
      signal,
    });
    if (!res.ok) {
      throw new Error((await res.text().catch(() => "")) || `R2 : HTTP ${res.status}`);
    }
  } else {
    await uploadR2Multipart(grant, path, file, onProgress, signal);
  }

  onProgress?.(1);
  return grant.origin;
}

/** Efface l'objet pour de bon : une vidéo retirée du dashboard ne doit plus peser. */
export async function deleteFromObjectStore(path: string, origin: ObjectOrigin): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    "origin-upload-url",
    { body: { path, origin, remove: true } },
  );
  if (error || !data?.ok) {
    throw new Error(data?.error ?? error?.message ?? "Suppression du fichier refusée.");
  }
}

/** URL de lecture temporaire, signée par le serveur pour l'origine de la vidéo. */
export async function objectStorePlaybackUrl(path: string, origin: ObjectOrigin): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(
    "origin-upload-url",
    { body: { path, origin, download: true } },
  );
  if (error) throw new Error(data?.error ?? error.message);
  if (!data?.url) throw new Error(data?.error ?? "Lien de lecture indisponible.");
  return data.url;
}
