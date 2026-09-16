const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return toHex(sig);
}

export function originPayload(method: string, path: string, exp: number): string {
  return `${method.toUpperCase()}\n${path}\n${exp}`;
}

export async function signOrigin(secret: string, method: string, path: string, exp: number): Promise<string> {
  return hmacHex(secret, originPayload(method, path, exp));
}

export function diskOriginConfigured(): { base: string; secret: string } | null {
  const base = (Deno.env.get("DISK_ORIGIN_BASE_URL") ?? "").trim().replace(/\/+$/, "");
  const secret = (Deno.env.get("DISK_ORIGIN_SECRET") ?? "").trim();
  if (!base || !secret) return null;
  return { base, secret };
}

export async function signedDiskDownloadUrl(path: string, ttlSeconds = 6 * 60 * 60): Promise<string | null> {
  const cfg = diskOriginConfigured();
  if (!cfg) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await signOrigin(cfg.secret, "GET", path, exp);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${cfg.base}/files/${encoded}?exp=${exp}&sig=${sig}`;
}

/**
 * Supprime un fichier sur le nœud disque. Sans ça, effacer une vidéo dans le
 * dashboard laisse le mp4 occuper la place indéfiniment.
 */
export async function deleteDiskObject(path: string): Promise<void> {
  const cfg = diskOriginConfigured();
  if (!cfg) throw new Error("Origine disque non configurée.");
  const exp = Math.floor(Date.now() / 1000) + 300;
  const sig = await signOrigin(cfg.secret, "DELETE", path, exp);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${cfg.base}/files/${encoded}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${exp}.${sig}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Origine disque : HTTP ${res.status} à la suppression.`);
  }
}

export async function signedDiskUploadToken(path: string, ttlSeconds = 6 * 60 * 60): Promise<{
  url: string;
  token: string;
  exp: number;
  chunkBytes: number;
}> {
  const cfg = diskOriginConfigured();
  if (!cfg) throw new Error("Origine disque non configurée (DISK_ORIGIN_BASE_URL / DISK_ORIGIN_SECRET).");
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await signOrigin(cfg.secret, "PUT", path, exp);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return {
    url: `${cfg.base}/files/${encoded}`,
    token: `${exp}.${sig}`,
    exp,
    chunkBytes: 32 * 1024 * 1024,
  };
}
