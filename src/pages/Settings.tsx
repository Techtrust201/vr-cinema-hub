import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { type AppRole, roleLabel } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import {
  LogOut,
  User as UserIcon,
  Shield,
  Users,
  Building2,
  ScrollText,
} from "lucide-react";

type Member = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: AppRole | null;
  created_at: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  old_role: AppRole | null;
  new_role: AppRole | null;
  created_at: string;
  actor_user_id: string | null;
  target_user_id: string | null;
};

export default function Settings() {
  const {
    user,
    role,
    signOut,
    canManageMembers,
    canManageSecurity,
    canTransferOwnership,
    isOwner,
  } = useAuth();
  const [tab, setTab] = useState<"account" | "users" | "security" | "org" | "about">(
    "account",
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("operator");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadMembers() {
    if (!canManageMembers) return;
    const { data, error } = await supabase.rpc("list_organization_members");
    if (error) {
      setMessage(error.message);
      return;
    }
    setMembers((data as Member[]) ?? []);
  }

  async function loadAudit() {
    if (!canManageMembers && !canManageSecurity) return;
    const { data, error } = await supabase
      .from("organization_audit_logs")
      .select("id,action,old_role,new_role,created_at,actor_user_id,target_user_id")
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error) setAudit((data as AuditRow[]) ?? []);
  }

  useEffect(() => {
    if (tab === "users") void loadMembers();
    if (tab === "security") void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, role]);

  async function changeRole(targetUserId: string, newRole: AppRole) {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("change_my_org_member_role", {
      _target_user_id: targetUserId,
      _new_role: newRole,
      _action: newRole === "owner" ? "transfer_ownership" : "set_role",
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Rôle mis à jour.");
    await loadMembers();
    await loadAudit();
  }

  async function removeMember(targetUserId: string, label: string) {
    if (
      !confirm(
        `Retirer l'accès de ${label} ? L'utilisateur ne pourra plus se connecter tant qu'il n'aura pas de rôle.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("remove_my_org_member_role", {
      _target_user_id: targetUserId,
      _action: "remove",
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Accès retiré.");
    await loadMembers();
    await loadAudit();
  }

  async function inviteMember() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke("invite-org-member", {
      body: { email: inviteEmail.trim(), role: inviteRole },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data?.error) {
      setMessage(String(data.error));
      return;
    }
    setInviteEmail("");
    setMessage(data?.invited ? "Invitation envoyée." : "Rôle appliqué au compte existant.");
    await loadMembers();
  }

  const tabs = [
    { id: "account" as const, label: "Mon compte", icon: UserIcon },
    { id: "users" as const, label: "Utilisateurs et accès", icon: Users },
    { id: "security" as const, label: "Sécurité", icon: Shield },
    { id: "org" as const, label: "Organisation", icon: Building2 },
    { id: "about" as const, label: "À propos", icon: ScrollText },
  ];

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6 animate-fade-in-up">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compte, accès, sécurité et organisation.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? "border-[hsl(var(--vr-cyan)_/_0.5)] bg-[hsl(var(--vr-cyan)_/_0.12)] text-foreground"
                  : "border-border/60 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {message && (
        <p className="text-xs rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          {message}
        </p>
      )}

      {tab === "account" && (
        <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[hsl(var(--vr-violet)_/_0.15)] border border-[hsl(var(--vr-violet)_/_0.3)] flex items-center justify-center">
              <UserIcon size={16} className="text-[hsl(var(--vr-violet))]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Connecté en tant que</p>
              <p className="text-sm font-medium truncate">{user?.email ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Rôle : {roleLabel(role)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium"
          >
            <LogOut size={14} /> Se déconnecter
          </button>
        </section>
      )}

      {tab === "users" && (
        <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-5 space-y-5">
          {!canManageMembers ? (
            <p className="text-sm text-muted-foreground">
              Seuls owner et admin peuvent gérer les accès.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">Inviter un membre</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@exemple.com"
                    className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as AppRole)}
                    className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                  >
                    {canTransferOwnership && (
                      <option value="owner">Propriétaire</option>
                    )}
                    <option value="admin">Administrateur</option>
                    <option value="operator">Opérateur</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy || !inviteEmail.trim()}
                    onClick={() => void inviteMember()}
                    className="rounded-lg px-3 py-2 text-sm font-medium bg-[hsl(var(--vr-cyan)_/_0.18)] border border-[hsl(var(--vr-cyan)_/_0.4)] disabled:opacity-50"
                  >
                    Inviter
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Transfert de propriété réservé au propriétaire. TechTrust doit rester
                  administrateur après transfert vers Alexandre.
                </p>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold">Membres</h2>
                <ul className="divide-y divide-border/50 rounded-lg border border-border/50">
                  {members.map((m) => (
                    <li
                      key={m.user_id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {m.display_name || m.email || m.user_id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          disabled={busy || m.user_id === user?.id}
                          value={m.role ?? "operator"}
                          onChange={(e) =>
                            void changeRole(m.user_id, e.target.value as AppRole)
                          }
                          className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
                        >
                          {canTransferOwnership && (
                            <option value="owner">Propriétaire</option>
                          )}
                          <option value="admin">Administrateur</option>
                          <option value="operator">Opérateur</option>
                        </select>
                        {m.user_id !== user?.id && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void removeMember(
                                m.user_id,
                                m.display_name || m.email || "ce membre",
                              )
                            }
                            className="rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive disabled:opacity-50"
                          >
                            Retirer
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                  {members.length === 0 && (
                    <li className="px-3 py-3 text-xs text-muted-foreground">
                      Aucun membre listé.
                    </li>
                  )}
                </ul>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "security" && (
        <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-5 space-y-3">
          <h2 className="text-sm font-semibold">Journal d&apos;audit</h2>
          {!canManageMembers && !canManageSecurity ? (
            <p className="text-sm text-muted-foreground">
              Accès sécurité réservé au propriétaire et aux administrateurs.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {audit.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-border/50 px-3 py-2 text-muted-foreground"
                >
                  <span className="text-foreground font-medium">{a.action}</span>
                  {" · "}
                  {a.old_role ?? "—"} → {a.new_role ?? "—"}
                  <div className="mt-0.5 opacity-80">
                    {new Date(a.created_at).toLocaleString("fr-FR")}
                  </div>
                </li>
              ))}
              {audit.length === 0 && (
                <li className="text-muted-foreground">Aucun événement visible.</li>
              )}
              {isOwner && (
                <li className="text-muted-foreground pt-1">
                  En tant que propriétaire, les événements de transfert sont visibles.
                </li>
              )}
            </ul>
          )}
        </section>
      )}

      {tab === "org" && (
        <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-5 space-y-2 text-sm">
          <h2 className="text-sm font-semibold">Organisation</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Production : projet Supabase <code>fllhnbeukuwrvserebqn</code>{" "}
            (Vercel <code>vr-cinema-hub.vercel.app</code>). Les secrets techniques
            (mots de passe, tokens, device_token, service_role) ne sont jamais
            exposés dans cette interface.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>• Owner : gouvernance et transfert de propriété</li>
            <li>• Admin : gestion membres (hors owner) + contenu</li>
            <li>• Operator : contenu uniquement (vidéos, playlists, sync)</li>
          </ul>
        </section>
      )}

      {tab === "about" && (
        <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-[hsl(var(--vr-cyan))]" />
            <h2 className="text-sm font-semibold">À propos</h2>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
            <li>• Synchronisation OTA via Supabase — pas de serveur local.</li>
            <li>• Les casques téléchargent leurs vidéos directement par internet.</li>
            <li>
              • L&apos;appairage casque se fait depuis la page <strong>Casques</strong> avec
              un code à 6 chiffres.
            </li>
            <li>• Voir docs/ENVIRONMENTS.md pour la matrice des environnements.</li>
          </ul>
        </section>
      )}
    </div>
  );
}
