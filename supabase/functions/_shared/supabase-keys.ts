/**
 * Resolve Supabase API keys for Edge Functions.
 *
 * Prefer new platform-provided dictionaries:
 *   SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS  → JSON { "default": "..." }
 *
 * Local fallback (supabase start / functions serve):
 *   SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * Never log key values.
 */

type KeyMap = Record<string, string>;

function parseKeyMap(raw: string | undefined, label: string): KeyMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} is not a JSON object`);
    }
    return parsed as KeyMap;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse error";
    throw new Error(`Failed to parse ${label}: ${msg}`);
  }
}

function pickDefault(map: KeyMap, label: string): string {
  const value = map.default;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} has no usable "default" entry`);
  }
  return value;
}

function isLocalRuntime(): boolean {
  // Hosted Edge Functions set DENSO_DEPLOYMENT_ID / SB_REGION.
  // Local `supabase functions serve` typically does not.
  return !Deno.env.get("DENO_DEPLOYMENT_ID") && !Deno.env.get("SB_REGION");
}

/** Client-safe key (RLS enforced). */
export function getPublishableKey(): string {
  const map = parseKeyMap(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"), "SUPABASE_PUBLISHABLE_KEYS");
  if (map) return pickDefault(map, "SUPABASE_PUBLISHABLE_KEYS");

  const legacy =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) {
    if (!isLocalRuntime()) {
      console.warn(
        "[supabase-keys] Using legacy publishable/anon key fallback in production — migrate to SUPABASE_PUBLISHABLE_KEYS",
      );
    }
    return legacy;
  }

  throw new Error("No publishable Supabase API key available");
}

/** Server-only key (bypasses RLS). Never expose to browser / Unity. */
export function getSecretKey(): string {
  const map = parseKeyMap(Deno.env.get("SUPABASE_SECRET_KEYS"), "SUPABASE_SECRET_KEYS");
  if (map) return pickDefault(map, "SUPABASE_SECRET_KEYS");

  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) {
    if (!isLocalRuntime()) {
      console.warn(
        "[supabase-keys] Using legacy service_role key fallback in production — migrate to SUPABASE_SECRET_KEYS",
      );
    }
    return legacy;
  }

  throw new Error("No secret Supabase API key available");
}
