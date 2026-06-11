import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FolderTree, Plus, Trash2, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface Group { id: string; name: string; description: string | null; }
interface Headset { id: string; name: string; }
interface Member { group_id: string; headset_id: string; }

export default function Groups() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [groups, setGroups] = useState<Group[]>([]);
  const [headsets, setHeadsets] = useState<Headset[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [g, h, m] = await Promise.all([
      supabase.from("headset_groups").select("*").order("name"),
      supabase.from("headsets").select("id, name").eq("status", "active").order("name"),
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
    if (error) toast.error(error.message);
    else { setNewName(""); toast.success("Groupe créé"); fetchAll(); }
  }

  async function deleteGroup(id: string, name: string) {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    const { error } = await supabase.from("headset_groups").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Supprimé"); fetchAll(); }
  }

  async function toggleMember(groupId: string, headsetId: string, present: boolean) {
    if (present) {
      await supabase.from("headset_group_members").delete().match({ group_id: groupId, headset_id: headsetId });
    } else {
      await supabase.from("headset_group_members").insert({ group_id: groupId, headset_id: headsetId });
    }
    fetchAll();
  }

  if (loading) return <div className="p-6 text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Groupes de casques</h1>
        <p className="text-sm text-muted-foreground">Regroupez les casques par lieu, client ou usage.</p>
      </div>

      {isAdmin && (
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
                  {isAdmin && (
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
                      return (
                        <button
                          key={h.id}
                          onClick={() => toggleMember(g.id, h.id, present)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded text-sm hover:bg-muted/40 transition"
                        >
                          <span>{h.name}</span>
                          {present
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