import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/device-jwt.ts";
import { getSecretKey } from "../_shared/supabase-keys.ts";

type Role = "owner" | "admin" | "operator";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const secret = getSecretKey();

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, secret);
  const { data: actorRole, error: roleErr } = await admin.rpc("get_user_role", {
    _user_id: userData.user.id,
  });
  if (roleErr || (actorRole !== "owner" && actorRole !== "admin")) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { email?: string; role?: Role; display_name?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const role = (body.role ?? "operator") as Role;
  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "invalid_email" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!["owner", "admin", "operator"].includes(role)) {
    return new Response(JSON.stringify({ error: "invalid_role" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (role === "owner" && actorRole !== "owner") {
    return new Response(JSON.stringify({ error: "admin_cannot_create_owner" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: body.display_name ?? email.split("@")[0] },
  });
  if (inviteErr) {
    // L'invitation a échoué, le plus souvent parce que le compte existe déjà : on le
    // retrouve pour lui appliquer le rôle demandé au lieu de renvoyer une erreur.
    //
    // La recherche s'arrêtait à la première page de 200 comptes. Au-delà, inviter une
    // personne déjà inscrite échouait sans explication utilisable. Le client Supabase
    // n'offre pas de recherche par adresse, il faut donc parcourir les pages. La borne
    // évite une boucle sans fin si l'API renvoyait toujours des résultats.
    const MAX_PAGES = 50;
    let existing: { id: string } | undefined;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const users = listed.data?.users ?? [];
      existing = users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (existing || users.length < 200) break;
    }
    if (!existing) {
      return new Response(JSON.stringify({ error: inviteErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { error: roleSetErr } = await admin.rpc("apply_member_role_change", {
      _actor_user_id: userData.user.id,
      _target_user_id: existing.id,
      _new_role: role,
      _action: role === "owner" ? "promote_owner" : "set_role",
      _metadata: { source: "invite-org-member", email },
    });
    if (roleSetErr) {
      return new Response(JSON.stringify({ error: roleSetErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, user_id: existing.id, invited: false, role }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targetId = invited.user?.id;
  if (!targetId) {
    return new Response(JSON.stringify({ error: "invite_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: roleSetErr } = await admin.rpc("apply_member_role_change", {
    _actor_user_id: userData.user.id,
    _target_user_id: targetId,
    _new_role: role,
    _action: role === "owner" ? "promote_owner" : "set_role",
    _metadata: { source: "invite-org-member", email },
  });
  if (roleSetErr) {
    return new Response(JSON.stringify({ error: roleSetErr.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, user_id: targetId, invited: true, role }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
