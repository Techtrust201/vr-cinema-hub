// Shared device JWT helpers (HS256) for headset authentication.
// NOTE: Lovable edge functions are deployed per-folder, but cross-folder
// relative imports work fine in Deno. Keep this file dependency-free.

const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array | string): string {
  const bin = typeof bytes === "string"
    ? bytes
    : String.fromCharCode(...bytes);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(usage: "sign" | "verify"): Promise<CryptoKey> {
  const secret = Deno.env.get("DEVICE_TOKEN_SECRET");
  if (!secret) throw new Error("DEVICE_TOKEN_SECRET is not configured");
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signDeviceToken(headsetId: string, ttlSeconds = 60 * 60 * 24 * 365): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: headsetId, iat: now, exp: now + ttlSeconds, typ: "device" };
  const data = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  const key = await getKey("sign");
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return `${data}.${b64urlEncode(sig)}`;
}

export interface DeviceClaims {
  sub: string;
  iat: number;
  exp: number;
  typ: string;
}

export async function verifyDeviceToken(token: string): Promise<DeviceClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const key = await getKey("verify");
  const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(s), encoder.encode(`${h}.${p}`));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as DeviceClaims;
    if (payload.typ !== "device") return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function extractBearer(req: Request): string | null {
  const h = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}