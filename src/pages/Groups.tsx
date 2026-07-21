import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FolderTree, Plus, Trash2, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { isPermissionError } from "@/lib/supabaseErrors";

interface Group { id: string; name: string; description: string | null; }
interface Headset { id: string; name: string; desired_manifest_version?: number; applied_manifest_version?: number; }
interface Member { group_id: string; headset_id: string; }

export default function Groups() {
  const { canManageContent } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [headsets, setHeadsets] = useState<Headset[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busyMember, setBusyMember] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [g, h, m] = await Promise.all([
      supabase.from("headset_groups").select("*").order("name"),
      supabase.from("headsets").select("id, name, desired_manifest_version, applied_manifest_version").eq("status", "active").order("name"),
      supabase.from("headset_group_members").select("*"),
    ]);
    if (g.error || h.error || m.error) toast.error("Erreur de chargement");
    setGroups((g.data ?? []) as Group[]);
    setHeadsets((h.data ?? []) as Headset[]);
    setMembers((m.data ?? []) as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function createGroup() {
    if (!newName.trim()) return;
    const { error } = await supabase.from("headset_groups").insert({ name: newName.trim() });
    if (error) {
      toast.error(isPermissionError(error)
        ? "Création refusée : droits insuffisants."
        : error.message);
      return;
    }
    setNewName("");
    toast.success("Groupe créé");
    fetchAll();
  }

  async function deleteGroup(id: string, name: string) {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    const { error } = await supabase.from("headset_groups").delete().eq("id", id);
    if (error) {
      toast.error(isPermissionError(error)
        ? "Suppression refusée : droits insuffisants."
        : error.message);
      return;
    }
    toast.success("Supprimé");
    fetchAll();
  }

  async function toggleMember(groupId: string, headsetId: string, present: boolean) {
    const key = `${groupId}:${headsetId}`;
    if (busyMember) return;
    setBusyMember(key);

    const headset = headsets.find((h) => h.id === headsetId);
    const group = groups.find((g) => g.id === groupId);
    console.info("[GroupDebug] toggling", {
      group_id: groupId,
      group_name: group?.name,
      headset_id: headsetId,
      headset_name: headset?.name,
      op: present ? "delete" : "insert",
    });

    const { data: beforeHeadset } = await supabase
      .from("headsets")
      .select("id, desired_manifest_version, applied_manifest_version")
      .eq("id", headsetId)
      .maybeSingle();
    const desiredBefore = beforeHeadset?.desired_manifest_version ?? 0;
    console.info("[GroupDebug] desired_before", desiredBefore);

    const { data: membershipBefore } = await supabase
      .from("headset_group_members")
      .select("group_id, headset_id")
      .eq("group_id", groupId)
      .eq("headset_id", headsetId)
      .maybeSingle();
    console.info("[GroupDebug] membership_before", membershipBefore);

    let mutationError: { code?: string; message?: string } | null = null;
    if (present) {
      const { error } = await supabase
        .from("headset_group_members")
        .delete()
        .match({ group_id: groupId, headset_id: headsetId });
      mutationError = error;
    } else {
      const { error } = await supabase
        .from("headset_group_members")
        .insert({ group_id: groupId, headset_id: headsetId });
      mutationError = error;
    }

    console.info("[GroupDebug] mutation_result", mutationError ?? { ok: true });
    if (mutationError) {
      console.error("[GroupDebug] mutation rejected", mutationError);
      toast.error(isPermissionError(mutationError)
        ? "Modification non enregistrée : droits insuffisants."
        : `Échec : ${mutationError.message}`);
      setBusyMember(null);
      return;
    }

    const { data: membershipAfter } = await supabase
      .from("headset_group_members")
      .select("group_id, headset_id")
      .eq("group_id", groupId)
      .eq("headset_id", headsetId)
      .maybeSingle();
    console.info("[GroupDebug] membership_after", membershipAfter);

    const membershipOk = present ? !membershipAfter : !!membershipAfter;
    if (!membershipOk) {
      toast.error("Mutation non confirmée par la base — réessayer.");
      setBusyMember(null);
      await fetchAll();
      return;
    }

    const { data: afterHeadset } = await supabase
      .from("headsets")
      .select("id, desired_manifest_version, applied_manifest_version")
      .eq("id", headsetId)
      .maybeSingle();
    const desiredAfter = afterHeadset?.desired_manifest_version ?? 0;
    console.info("[GroupDebug] desired_before_after", { before: desiredBefore, after: desiredAfter });

    const bumped = desiredAfter > desiredBefore;
    console.info("[GroupDebug] bump_confirmed", bumped);
    if (!bumped) {
      toast.warning(
        "Membre mis à jour, mais desired_manifest_version n'a pas augmenté. Vérifier les triggers / assignments.",
      );
    } else {
      toast.success(present ? "Casque retiré du groupe (manifest bumpé)" : "Casque ajouté au groupe (manifest bumpé)");
    }

    setBusyMember(null);
    await fetchAll();
  }

  if (loading) return <div className="p-6 text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Groupes de casques</h1>
        <p className="text-sm text-muted-foreground">Regroupez les casques par lieu, client ou usage.</p>
      </div>

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
                      const busy = busyMember === `${g.id}:${h.id}`;
                      return (
                        <button
                          key={h.id}
                          disabled={!!busyMember}
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
    </div>
  );
}
