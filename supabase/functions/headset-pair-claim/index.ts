import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders, signDeviceToken } from "../_shared/device-jwt.ts";
import { getPublishableKey, getSecretKey } from "../_shared/supabase-keys.ts";

// Called by the dashboard (admin user, JWT required) to claim a pairing
// code displayed on a headset. Creates the headset row, signs a device
// token, and stores it on the pairing record so the headset can fetch it.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { code?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.code || !body.name || body.name.trim().length === 0) {
    return new Response(JSON.stringify({ error: "code and name are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify the calling user and that they have admin role.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getPublishableKey(),
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.slice(7);
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getSecretKey(),
  );

  const { data: actorRole, error: roleErr } = await admin.rpc("get_user_role", {
    _user_id: userData.user.id,
  });
  if (
    roleErr ||
    (actorRole !== "owner" && actorRole !== "admin" && actorRole !== "operator")
  ) {
    return new Response(JSON.stringify({ error: "Forbidden: content managers only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: pairing, error: pairErr } = await admin
    .from("pairing_codes")
    .select("id, expires_at, claimed_by_headset_id, pending_serial, pending_model")
    .eq("code", body.code)
    .maybeSingle();

  if (pairErr || !pairing) {
    return new Response(JSON.stringify({ error: "Code not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (pairing.claimed_by_headset_id) {
    return new Response(JSON.stringify({ error: "Code already used" }), {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ error: "Code expired" }), {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Reuse existing headset for the same physical serial to avoid duplicates.
  let headset: { id: string; name: string } | null = null;
  const serial = pairing.pending_serial?.trim() || null;
  if (serial) {
    const { data: existing, error: findErr } = await admin
      .from("headsets")
      .select("id, name")
      .eq("serial", serial)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (findErr) {
      console.error("headset serial lookup failed", findErr);
    } else if (existing) {
      const { data: updated, error: updErr } = await admin
        .from("headsets")
        .update({
          name: body.name.trim(),
          model: pairing.pending_model,
          status: "active",
          paired_by: userData.user.id,
          paired_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, name")
        .single();
      if (updErr || !updated) {
        console.error("headset reuse update failed", updErr);
        return new Response(JSON.stringify({ error: "Could not reuse headset" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      headset = updated;
      console.log(`[PairClaim] reused headset_id=${headset.id} serial_hash_present=true`);
    }
  }

  if (!headset) {
    const { data: created, error: hErr } = await admin
      .from("headsets")
      .insert({
        name: body.name.trim(),
        serial,
        model: pairing.pending_model,
        status: "active",
        paired_by: userData.user.id,
        paired_at: new Date().toISOString(),
      })
      .select("id, name")
      .single();

    if (hErr || !created) {
      console.error("headset insert failed", hErr);
      return new Response(JSON.stringify({ error: "Could not create headset" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    headset = created;
  }

  // Nouveau casque actif : bump immédiat pour hériter des assignments `all`
  // déjà présents (sinon desired reste 0 et le report v0 ne peut jamais confirmer).
  const { error: bumpErr } = await admin.rpc("bump_headset_versions", {
    _headset_ids: [headset.id],
    _cause: "pairing_claim",
  });
  if (bumpErr) {
    console.error("pairing bump failed", bumpErr);
  } else {
    console.log(`[HeadsetContact] headset_id=${headset.id} source=pairing`);
    await admin
      .from("headsets")
      .update({
        last_contact_source: "pairing",
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", headset.id);
  }

  const device_token = await signDeviceToken(headset.id);

  await admin
    .from("pairing_codes")
    .update({
      claimed_by_headset_id: headset.id,
      claimed_at: new Date().toISOString(),
      device_token,
    })
    .eq("id", pairing.id);

  return new Response(
    JSON.stringify({ headset_id: headset.id, name: headset.name }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});