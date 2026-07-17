import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/device-jwt.ts";
import { getSecretKey } from "../_shared/supabase-keys.ts";

// Called by the Quest headset (no user auth) on first launch to request
// a 6-digit pairing code. The headset polls headset-pair-poll with the
// returned `pairing_secret` until an admin claims the code.

function gen6digit(): string {
  // Cryptographically random 6-digit numeric code (zero-padded).
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 1_000_000).toString().padStart(6, "0");
}

function genSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { serial?: string; model?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getSecretKey(),
  );

  // Try a few times in case of (extremely unlikely) code collision.
  let inserted: any = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = gen6digit();
    const pairing_secret = genSecret();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("pairing_codes")
      .insert({
        code,
        pairing_secret,
        expires_at,
        pending_serial: body.serial ?? null,
        pending_model: body.model ?? null,
      })
      .select("code, pairing_secret, expires_at")
      .single();
    if (!error) {
      inserted = data;
      break;
    }
    lastError = error;
    // 23505 = unique_violation → retry with a new code
    if ((error as any).code !== "23505") break;
  }

  if (!inserted) {
    console.error("pair-init failed", lastError);
    return new Response(JSON.stringify({ error: "Could not allocate pairing code" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(inserted), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});