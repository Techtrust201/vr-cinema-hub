import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveData } from "@/hooks/useLiveData";
import { useConfirm } from "@/hooks/useConfirm";
import { FolderTree, Plus, Trash2, Loader2, Check, X, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { isPermissionError } from "@/lib/supabaseErrors";

interface Group { id: string; name: string; description: string | null; }
interface Headset { id: string; name: string; desired_manifest_version?: number; applied_manifest_version?: number; }
interface Member { group_id: string; headset_id: string; }

type GroupsSnapshot = { groups: Group[]; headsets: Headset[]; members: Member[] };

export default function Groups() {
  const { canManageContent } = useAuth();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busyMembers, setBusyMembers] = useState<Record<string, true>>({});
  const { confirm, confirmDialog } = useConfirm();

  const { data, initialLoading, error, refresh, mutate } = useLiveData<GroupsSnapshot>(
    async (signal) => {
      const [g, h, m] = await Promise.all([
        supabase.from("headset_groups").select("*").order("name").abortSignal(signal),
        supabase.from("headsets").select("id, name, desired_manifest_version, applied_manifest_version").eq("status", "active").order("name").abortSignal(signal),
        supabase.from("headset_group_members").select("*").abortSignal(signal),
      ]);
      const failure = g.error ?? h.error ?? m.error;
      if (failure) throw new Error(failure.message);
      return {
        groups: (g.data ?? []) as Group[],
        headsets: (h.data ?? []) as Headset[],
        members: (m.data ?? []) as Member[],
      };
    },
  );

  const groups = data?.groups ?? [];
  const headsets = data?.headsets ?? [];
  const members = data?.members ?? [];

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("headset_groups").insert({ name });
    if (error) {
      toast.error(isPermissionError(error)
        ? "Création refusée : droits insuffisants."
        : error.message);
      return;
    }
    setNewName("");
    toast.success("Groupe créé");
    void refresh();
  }

  async function deleteGroup(id: string, name: string) {
    const ok = await confirm({
      title: `Supprimer le groupe « ${name} » ?`,
      description: "Les casques ne sont pas supprimés, seul le groupe et ses affectations le sont.",
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (!ok) return;

    const previous = data;
    mutate((current) =>
      current
        ? {
            ...current,
            groups: current.groups.filter((g) => g.id !== id),
            members: current.members.filter((m) => m.group_id !== id),
          }
        : current,
    );
    const { error } = await supabase.from("headset_groups").delete().eq("id", id);
    if (error) {
      mutate(() => previous);
      toast.error(isPermissionError(error)
        ? "Suppression refusée : droits insuffisants."
        : error.message);
      return;
    }
    toast.success("Supprimé");
  }

  /**
   * The membership write is the only round-trip on the critical path: the former
   * before/after diagnostic reads cost four extra round-trips per click. Manifest
   * bumping is a database trigger concern, and the Sync page's Diag button is the
   * place to audit it.
   */
  async function toggleMember(groupId: string, headsetId: string, present: boolean) {
    const key = `${groupId}:${headsetId}`;
    if (busyMembers[key]) return;
    setBusyMembers((s) => ({ ...s, [key]: true }));

    mutate((current) => {
      if (!current) return current;
      const members = present
        ? current.members.filter((m) => !(m.group_id === groupId && m.headset_id === headsetId))
        : [...current.members, { group_id: groupId, headset_id: headsetId }];
      return { ...current, members };
    });

    const query = present
      ? supabase.from("headset_group_members").delete().match({ group_id: groupId, headset_id: headsetId })
      : supabase.from("headset_group_members").insert({ group_id: groupId, headset_id: headsetId });
    const { error } = await query;

    setBusyMembers((s) => {
      const { [key]: _dropped, ...rest } = s;
      return rest;
    });

    if (error) {
      void refresh();
      toast.error(isPermissionError(error)
        ? "Modification non enregistrée : droits insuffisants."
        : `Échec : ${error.message}`);
      return;
    }
    toast.success(present ? "Casque retiré du groupe" : "Casque ajouté au groupe");
  }

  if (initialLoading) return <div className="p-6 text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Groupes de casques</h1>
        <p className="text-sm text-muted-foreground">Regroupez les casques par lieu, client ou usage.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <WifiOff size={13} />
          Données peut-être obsolètes — dernière actualisation échouée ({error.message}).
        </div>
      )}

      {canManageContent && (
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
            placeholder="Nom du groupe (ex: Magasin Lyon)"
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-border/50 focus:outline-none focus:border-[hsl(var(--vr-violet))]"
          />
          <button onClick={createGroup} className="px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white flex items-center gap-2 hover:opacity-90 transition">
            <Plus size={16} /> Créer
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-xl">
          <FolderTree className="mx-auto mb-3 text-muted-foreground/50" size={32} />
          <p className="text-muted-foreground">Aucun groupe.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {groups.map((g) => {
            const groupMembers = members.filter((m) => m.group_id === g.id);
            const isEditing = editing === g.id;
            return (
              <div key={g.id} className="p-4 rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold">{g.name}</p>
                    <p className="text-xs text-muted-foreground">{groupMembers.length} casque{groupMembers.length !== 1 ? "s" : ""}</p>
                  </div>
                  {canManageContent && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditing(isEditing ? null : g.id)} className="text-xs text-[hsl(var(--vr-violet))] hover:underline">
                        {isEditing ? "Fermer" : "Gérer les membres"}
                      </button>
                      <button onClick={() => deleteGroup(g.id, g.name)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {isEditing && (
                  <div className="space-y-1 pt-3 border-t border-border/30">
                    {headsets.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucun casque actif.</p>
                    ) : headsets.map((h) => {
                      const present = groupMembers.some((m) => m.headset_id === h.id);
                      const busy = busyMembers[`${g.id}:${h.id}`] === true;
                      return (
                        <button
                          key={h.id}
                          disabled={busy}
                          onClick={() => toggleMember(g.id, h.id, present)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded text-sm hover:bg-muted/40 transition disabled:opacity-50"
                        >
                          <span>{h.name}</span>
                          {busy
                            ? <Loader2 size={14} className="animate-spin text-muted-foreground" />
                            : present
                              ? <Check size={14} className="text-[hsl(140_70%_55%)]" />
                              : <X size={14} className="text-muted-foreground/40" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
