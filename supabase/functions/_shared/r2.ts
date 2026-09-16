// Signature AWS SigV4 pour Cloudflare R2.
//
// R2 parle le dialecte S3 : on signe soit une URL (query string), soit une requête
// (en-tête Authorization). Les URL signées servent au casque et au navigateur, qui
// n'ont jamais la clé secrète ; les requêtes signées servent aux opérations
// multipart pilotées depuis l'Edge Function.
//
// Pas de SDK : le runtime Deno des Edge Functions a tout ce qu'il faut, et une
// dépendance externe ici serait un point de panne au démarrage de la fonction.
//
// `presignRaw` et `uriEncode` sont exportés pour être rejoués contre les vecteurs
// de test officiels d'AWS (voir r2.test.ts) : une signature fausse ne se
// diagnostique pas, R2 répond un 403 sans détail.

const encoder = new TextEncoder();
const ALGORITHM = "AWS4-HMAC-SHA256";
const DEFAULT_REGION = "auto"; // R2 n'a qu'une région logique.
const SERVICE = "s3";

export interface R2Config {
  endpoint: string; // https://<account_id>.r2.cloudflarestorage.com
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Toujours "auto" sur R2 ; paramétrable pour rejouer les vecteurs AWS. */
  region?: string;
}

export function r2Configured(): R2Config | null {
  const endpoint = (Deno.env.get("R2_ENDPOINT") ?? "").trim().replace(/\/+$/, "");
  const bucket = (Deno.env.get("R2_BUCKET") ?? "").trim();
  const accessKeyId = (Deno.env.get("R2_ACCESS_KEY_ID") ?? "").trim();
  const secretAccessKey = (Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "").trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const buf = typeof data === "string" ? encoder.encode(data) : data;
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)));
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data)));
}

/**
 * Encodage exigé par S3 : plus strict qu'encodeURIComponent, qui laisse passer
 * `!'()*`. Une clé contenant une apostrophe casserait la signature sans ça.
 */
export function uriEncode(input: string, encodeSlash: boolean): string {
  let out = "";
  for (const ch of input) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      for (const byte of encoder.encode(ch)) {
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

async function signingKey(secretAccessKey: string, dateStamp: string, region: string): Promise<Uint8Array> {
  let key = encoder.encode(`AWS4${secretAccessKey}`);
  for (const part of [dateStamp, region, SERVICE, "aws4_request"]) {
    key = await hmac(key, part);
  }
  return key;
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k, true)}=${uriEncode(params[k], true)}`)
    .join("&");
}

/**
 * Cœur de la signature par query string, sans rien savoir de R2 : c'est ce qui
 * permet de le confronter aux vecteurs de test AWS, bucket en virtual-host inclus.
 * `canonicalUri` doit déjà être encodé et commencer par `/`.
 */
export async function presignRaw(options: {
  method: string;
  endpoint: string;
  canonicalUri: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  ttlSeconds: number;
  query?: Record<string, string>;
  now?: Date;
}): Promise<string> {
  const { amzDate, dateStamp } = amzDates(options.now ?? new Date());
  const host = new URL(options.endpoint).host;
  const scope = `${dateStamp}/${options.region}/${SERVICE}/aws4_request`;

  const params: Record<string, string> = {
    ...(options.query ?? {}),
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${options.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(options.ttlSeconds),
    "X-Amz-SignedHeaders": "host",
  };

  const canonicalRequest = [
    options.method,
    options.canonicalUri,
    canonicalQuery(params),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [ALGORITHM, amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = toHex(
    await hmac(await signingKey(options.secretAccessKey, dateStamp, options.region), stringToSign),
  );

  return `${options.endpoint}${options.canonicalUri}?${canonicalQuery(params)}&X-Amz-Signature=${signature}`;
}

/**
 * URL signée utilisable telle quelle par un client qui n'a pas la clé.
 * `UNSIGNED-PAYLOAD` évite d'imposer au client de hacher son corps de requête,
 * ce qui serait impossible pour un envoi en flux.
 */
export async function presignR2(options: {
  method: "GET" | "PUT" | "HEAD";
  key: string;
  ttlSeconds?: number;
  query?: Record<string, string>;
  cfg?: R2Config;
}): Promise<string> {
  const cfg = options.cfg ?? r2Configured();
  if (!cfg) {
    throw new Error("R2 non configuré (R2_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).");
  }
  return await presignRaw({
    method: options.method,
    endpoint: cfg.endpoint,
    canonicalUri: `/${uriEncode(cfg.bucket, true)}/${uriEncode(options.key, false)}`,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    region: cfg.region ?? DEFAULT_REGION,
    // R2 plafonne à 7 jours, comme S3.
    ttlSeconds: Math.min(Math.max(options.ttlSeconds ?? 6 * 60 * 60, 1), 7 * 24 * 60 * 60),
    query: options.query,
  });
}

export async function signedR2DownloadUrl(key: string, ttlSeconds = 6 * 60 * 60): Promise<string | null> {
  if (!r2Configured()) return null;
  return await presignR2({ method: "GET", key, ttlSeconds });
}

/**
 * Requête signée par en-tête, pour les appels que l'Edge Function passe elle-même
 * (multipart, suppression). Contrairement au presign, le corps est haché : R2
 * refuse un POST multipart en `UNSIGNED-PAYLOAD`.
 */
export async function r2Fetch(options: {
  method: string;
  key: string;
  query?: Record<string, string>;
  body?: string;
  contentType?: string;
  cfg?: R2Config;
}): Promise<Response> {
  const cfg = options.cfg ?? r2Configured();
  if (!cfg) throw new Error("R2 non configuré.");

  const region = cfg.region ?? DEFAULT_REGION;
  const { amzDate, dateStamp } = amzDates(new Date());
  const host = new URL(cfg.endpoint).host;
  const canonicalUri = `/${uriEncode(cfg.bucket, true)}/${uriEncode(options.key, false)}`;
  const query = canonicalQuery(options.query ?? {});
  const payloadHash = await sha256Hex(options.body ?? "");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (options.contentType) headers["content-type"] = options.contentType;

  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${headers[h].trim()}\n`).join("");
  const signedHeaderList = signedHeaders.join(";");
  const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;

  const canonicalRequest = [
    options.method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaderList,
    payloadHash,
  ].join("\n");

  const stringToSign = [ALGORITHM, amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = toHex(await hmac(await signingKey(cfg.secretAccessKey, dateStamp, region), stringToSign));

  const outHeaders = new Headers();
  for (const h of signedHeaders) {
    if (h !== "host") outHeaders.set(h, headers[h]);
  }
  outHeaders.set(
    "authorization",
    `${ALGORITHM} Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`,
  );

  const url = `${cfg.endpoint}${canonicalUri}${query ? `?${query}` : ""}`;
  return await fetch(url, { method: options.method, headers: outHeaders, body: options.body });
}

function xmlValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

/**
 * Ouvre un envoi multipart et rend une URL signée par morceau. Un fichier de 900 Mo
 * envoyé en un seul PUT repart de zéro à la moindre coupure ; découpé, seul le
 * morceau en cours est perdu.
 */
export async function createR2MultipartUpload(options: {
  key: string;
  contentType: string;
  partCount: number;
  ttlSeconds?: number;
}): Promise<{ uploadId: string; partUrls: string[] }> {
  const cfg = r2Configured();
  if (!cfg) throw new Error("R2 non configuré.");

  const res = await r2Fetch({
    method: "POST",
    key: options.key,
    query: { uploads: "" },
    contentType: options.contentType,
    cfg,
  });
  if (!res.ok) {
    throw new Error(`R2 CreateMultipartUpload : HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }
  const uploadId = xmlValue(await res.text(), "UploadId");
  if (!uploadId) throw new Error("R2 CreateMultipartUpload : UploadId absent de la réponse.");

  const partUrls: string[] = [];
  for (let i = 1; i <= options.partCount; i++) {
    partUrls.push(
      await presignR2({
        method: "PUT",
        key: options.key,
        ttlSeconds: options.ttlSeconds ?? 6 * 60 * 60,
        query: { partNumber: String(i), uploadId },
        cfg,
      }),
    );
  }
  return { uploadId, partUrls };
}

export async function completeR2MultipartUpload(options: {
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}): Promise<void> {
  const body =
    `<CompleteMultipartUpload>` +
    options.parts
      .slice()
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
      .join("") +
    `</CompleteMultipartUpload>`;

  const res = await r2Fetch({
    method: "POST",
    key: options.key,
    query: { uploadId: options.uploadId },
    body,
    contentType: "application/xml",
  });
  const text = await res.text().catch(() => "");
  // S3 autorise un 200 porteur d'erreur : il faut lire le corps, pas que le code.
  if (!res.ok || text.includes("<Error>")) {
    throw new Error(`R2 CompleteMultipartUpload : HTTP ${res.status} ${text}`);
  }
}

export async function abortR2MultipartUpload(key: string, uploadId: string): Promise<void> {
  await r2Fetch({ method: "DELETE", key, query: { uploadId } }).catch(() => undefined);
}

export async function deleteR2Object(key: string): Promise<void> {
  const res = await r2Fetch({ method: "DELETE", key });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DeleteObject : HTTP ${res.status}`);
  }
}
