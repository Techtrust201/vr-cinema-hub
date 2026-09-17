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

  // Un code de six chiffres se devine par balayage si rien ne limite les essais. Le
  // compteur porte sur le compte appelant, la seule identité disponible ici : l'adresse
  // IP passe par l'infrastructure Supabase et ne distingue pas les appelants.
  //
  // En cas de panne du compteur, l'appairage continue : bloquer la mise en service d'une
  // flotte pour protéger un scénario qui suppose déjà un compte autorisé détourné serait
  // un mauvais échange.
  const MAX_FAILED_CLAIMS = 10;
  const { data: recentFailures, error: rateErr } = await admin.rpc(
    "recent_failed_pairing_claims",
    { _actor_user_id: userData.user.id, _window_minutes: 15 },
  );
  if (rateErr) {
    console.error("pairing rate check failed", rateErr);
  } else if ((recentFailures ?? 0) >= MAX_FAILED_CLAIMS) {
    console.error("pairing claim rate limited", {
      actor: userData.user.id,
      failures: recentFailures,
    });
    return new Response(
      JSON.stringify({
        error: "Trop de codes erronés. Patientez un quart d'heure avant de réessayer.",
      }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const noteAttempt = (succeeded: boolean) =>
    admin
      .from("pairing_claim_attempts")
      .insert({ actor_user_id: userData.user.id, succeeded })
      .then(() => undefined, () => undefined);

  const { data: pairing, error: pairErr } = await admin
    .from("pairing_codes")
    .select("id, expires_at, claimed_by_headset_id, pending_serial, pending_model")
    .eq("code", body.code)
    .maybeSingle();

  if (pairErr || !pairing) {
    await noteAttempt(false);
    return new Response(JSON.stringify({ error: "Code not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (pairing.claimed_by_headset_id) {
    await noteAttempt(false);
    return new Response(JSON.stringify({ error: "Code already used" }), {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    // Un code expiré n'apprend rien sur les codes valides : ne pas le compter comme un
    // essai évite de punir un exploitant simplement trop lent.
    return new Response(JSON.stringify({ error: "Code expired" }), {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Reuse existing headset for the same physical serial to avoid duplicates.
  let headset: { id: string; name: string; token_version?: number } | null = null;
  const serial = pairing.pending_serial?.trim() || null;
  if (serial) {
    const { data: existing, error: findErr } = await admin
      .from("headsets")
      .select("id, name, token_version")
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
          // Réappairer périme les jetons précédents de ce casque : celui qui restait sur
          // l'appareil d'avant, ou une copie prise entre-temps, cesse d'être accepté.
          token_version: (existing.token_version ?? 0) + 1,
        })
        .eq("id", existing.id)
        .select("id, name, token_version")
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
      .select("id, name, token_version")
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
  // Sans ce bump, `desired_manifest_version` reste à 0 : le casque n'héritera jamais des
  // playlists « tous les casques » et restera vide. L'échec doit donc arrêter
  // l'appairage — l'exploitant peut recommencer, alors qu'un casque annoncé « appairé »
  // mais muet se diagnostique très mal, surtout au milieu d'une flotte.
  if (bumpErr) {
    console.error("pairing bump failed", bumpErr);
    return new Response(
      JSON.stringify({ error: "Préparation du casque incomplète, relancez l'appairage." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log(`[HeadsetContact] headset_id=${headset.id} source=pairing`);
  await admin
    .from("headsets")
    .update({
      last_contact_source: "pairing",
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", headset.id);

  // Le jeton porte la version en vigueur : toute version antérieure sera refusée.
  const device_token = await signDeviceToken(
    headset.id,
    undefined,
    headset.token_version ?? 0,
  );

  const { data: claimed, error: claimErr } = await admin
    .from("pairing_codes")
    .update({
      claimed_by_headset_id: headset.id,
      claimed_at: new Date().toISOString(),
      device_token,
    })
    .eq("id", pairing.id)
    .is("claimed_by_headset_id", null)
    .select("id")
    .maybeSingle();

  if (claimErr) {
    console.error("pairing claim update failed", claimErr);
    return new Response(JSON.stringify({ error: "Could not claim code" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!claimed) {
    return new Response(JSON.stringify({ error: "Code already used" }), {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await noteAttempt(true);

  return new Response(
    JSON.stringify({ headset_id: headset.id, name: headset.name }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});