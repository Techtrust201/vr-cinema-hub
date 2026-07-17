import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ListVideo, Plus, Trash2, Loader2, Check, Globe2, Headset as HeadsetIcon, FolderTree } from "lucide-react";
import { toast } from "sonner";
import { isPermissionError } from "@/lib/supabaseErrors";
import { computeScopeUnionDiff } from "@/lib/assignmentDiff";

interface Playlist { id: string; name: string; description: string | null; }
interface Video { id: string; name: string; }
interface PlaylistVideo { playlist_id: string; video_id: string; position: number; }
interface Headset { id: string; name: string; }
interface Group { id: string; name: string; }
interface Assignment {
  id: string;
  playlist_id: string;
  target_type: "headset" | "group" | "all";
  target_id: string | null;
}

export default function Playlists() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [pvideos, setPvideos] = useState<PlaylistVideo[]>([]);
  const [headsets, setHeadsets] = useState<Headset[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [p, v, pv, h, g, a] = await Promise.all([
      supabase.from("playlists").select("*").order("name"),
      supabase.from("videos").select("id, name").order("name"),
      supabase.from("playlist_videos").select("*"),
      supabase.from("headsets").select("id, name").eq("status", "active").order("name"),
      supabase.from("headset_groups").select("id, name").order("name"),
      supabase.from("assignments").select("*"),
    ]);
    setPlaylists((p.data ?? []) as Playlist[]);
    setVideos((v.data ?? []) as Video[]);
    setPvideos((pv.data ?? []) as PlaylistVideo[]);
    setHeadsets((h.data ?? []) as Headset[]);
    setGroups((g.data ?? []) as Group[]);
    setAssignments((a.data ?? []) as Assignment[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function createPlaylist() {
    if (!newName.trim()) return;
    const { error } = await supabase.from("playlists").insert({ name: newName.trim() });
    if (error) toast.error(error.message);
    else { setNewName(""); toast.success("Playlist créée"); fetchAll(); }
  }

  async function deletePlaylist(id: string, name: string) {
    if (!confirm(`Supprimer la playlist "${name}" ?`)) return;
    const { error } = await supabase.from("playlists").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Supprimée"); fetchAll(); }
  }

  async function toggleVideo(playlistId: string, videoId: string, present: boolean) {
    const playlist = playlists.find((p) => p.id === playlistId);
    const video = videos.find((v) => v.id === videoId);
    const op = present ? "delete" : "insert";
    console.info("[PlaylistDebug] toggling", {
      playlist_id: playlistId, playlist_name: playlist?.name,
      video_id: videoId, video_name: video?.name, op,
    });

    // 1. Snapshot impacted headsets BEFORE
    const beforeRes = await supabase.rpc("diagnose_playlist_impact", { _playlist_id: playlistId });
    if (beforeRes.error) {
      console.warn("[PlaylistDebug] diag before error", beforeRes.error);
      if (isPermissionError(beforeRes.error)) {
        toast.error("Diagnostic refusé : droits administrateur requis.");
      } else {
        toast.error(`Diagnostic indisponible : ${beforeRes.error.message}. Mutation annulée.`);
      }
      return;
    }
    type ImpactRow = { headset_id: string; headset_name?: string; desired?: number; desired_manifest_version?: number };
    const beforeImpacted = ((beforeRes.data as { impacted_headsets?: ImpactRow[] } | null)?.impacted_headsets) ?? [];
    console.info("[PlaylistDebug] impacted_headsets_before", beforeImpacted);

    // 2. Mutation
    let mutationError: { code?: string; message?: string } | null = null;
    if (present) {
      const { error } = await supabase
        .from("playlist_videos").delete()
        .match({ playlist_id: playlistId, video_id: videoId });
      mutationError = error;
    } else {
      const max = Math.max(0, ...pvideos.filter((x) => x.playlist_id === playlistId).map((x) => x.position));
      const { error } = await supabase
        .from("playlist_videos")
        .insert({ playlist_id: playlistId, video_id: videoId, position: max + 1 });
      mutationError = error;
    }

    if (mutationError) {
      console.error("[PlaylistDebug] mutation rejected", mutationError);
      if (isPermissionError(mutationError)) {
        toast.error("Modification non enregistrée : votre compte n'a pas les droits administrateur.");
      } else {
        toast.error(`Échec : ${mutationError.message}`);
      }
      return;
    }

    // 3. Refetch ciblé pour confirmer
    const { data: row } = await supabase
      .from("playlist_videos").select("*")
      .eq("playlist_id", playlistId).eq("video_id", videoId).maybeSingle();
    const db_confirmed = present ? row === null : row !== null;
    console.info("[PlaylistDebug] mutation result", { op, success: true, db_confirmed, row_after: row });
    if (!db_confirmed) {
      toast.error("Mutation non confirmée par la base — réessayer.");
      console.warn("[PlaylistDebug] db_confirmed=false");
      return;
    }

    // 4. Snapshot AFTER + diff bumped/not_bumped
    const afterRes = await supabase.rpc("diagnose_playlist_impact", { _playlist_id: playlistId });
    if (afterRes.error) {
      console.warn("[PlaylistDebug] diag after error", afterRes.error);
      toast.warning(`Mutation OK mais diagnostic after indisponible : ${afterRes.error.message}`);
      fetchAll();
      return;
    }
    const afterImpacted = ((afterRes.data as { impacted_headsets?: ImpactRow[] } | null)?.impacted_headsets) ?? [];
    console.info("[PlaylistDebug] impacted_headsets_after", afterImpacted);

    const beforeMap = new Map<string, number>(
      beforeImpacted.map((h) => [h.headset_id, h.desired ?? h.desired_manifest_version ?? 0]),
    );
    const bumped: Array<{ id: string; name: string; before: number; after: number }> = [];
    const not_bumped: Array<{ id: string; name: string; desired: number }> = [];
    for (const h of afterImpacted) {
      const afterDesired = h.desired ?? h.desired_manifest_version ?? 0;
      const before = beforeMap.get(h.headset_id) ?? 0;
      if (afterDesired > before) {
        bumped.push({ id: h.headset_id, name: h.headset_name ?? h.headset_id, before, after: afterDesired });
      } else {
        not_bumped.push({ id: h.headset_id, name: h.headset_name ?? h.headset_id, desired: afterDesired });
      }
    }
    console.info("[PlaylistDebug] bumped_headsets", bumped);
    console.info("[PlaylistDebug] not_bumped_headsets", not_bumped);

    if (not_bumped.length > 0) {
      toast.warning(`Sync incomplète : ${not_bumped.length} casque(s) impacté(s) n'ont pas bumpé. Voir console.`);
    } else if (afterImpacted.length === 0) {
      toast.success(
        present
          ? "Vidéo retirée (aucun casque assigné à cette playlist)."
          : "Vidéo ajoutée (aucun casque assigné à cette playlist).",
      );
    } else {
      toast.success(
        `${present ? "Vidéo retirée" : "Vidéo ajoutée"} — ${bumped.length} casque(s) à resynchroniser.`,
      );
    }
    fetchAll();
  }

  async function toggleAssignment(playlistId: string, targetType: "headset" | "group" | "all", targetId: string | null) {
    const existing = assignments.find((a) =>
      a.playlist_id === playlistId && a.target_type === targetType && a.target_id === targetId,
    );
    const playlist = playlists.find((p) => p.id === playlistId);
    console.info("[PlaylistDebug] toggleAssignment", {
      playlist_id: playlistId, playlist_name: playlist?.name,
      target_type: targetType, target_id: targetId, op: existing ? "delete" : "insert",
    });
    const beforeRes = await supabase.rpc("diagnose_playlist_impact", { _playlist_id: playlistId });
    if (beforeRes.error) {
      console.warn("[PlaylistDebug] assignment diag before error", beforeRes.error);
      if (isPermissionError(beforeRes.error)) {
        toast.error("Diagnostic refusé : droits administrateur requis.");
      } else {
        toast.error(`Diagnostic indisponible : ${beforeRes.error.message}. Mutation annulée.`);
      }
      return;
    }
    const beforeImpacted = ((beforeRes.data as { impacted_headsets?: Array<{ headset_id: string; desired_manifest_version?: number }> })?.impacted_headsets) ?? [];
    console.info("[PlaylistDebug] impacted_headsets_before", beforeImpacted);

    let mutationError: { code?: string; message?: string } | null = null;
    if (existing) {
      const { error } = await supabase.from("assignments").delete().eq("id", existing.id);
      mutationError = error;
    } else {
      const itemsForPl = pvideos.filter((x) => x.playlist_id === playlistId);
      if (itemsForPl.length === 0) {
        toast.warning("Cette playlist est vide — ajoute au moins une vidéo avant de la diffuser.");
        return;
      }
      const { error } = await supabase
        .from("assignments")
        .insert({ playlist_id: playlistId, target_type: targetType, target_id: targetId });
      mutationError = error;
    }

    if (mutationError) {
      console.error("[PlaylistDebug] assignment rejected", mutationError);
      if (isPermissionError(mutationError)) {
        toast.error("Modification non enregistrée : votre compte n'a pas les droits administrateur.");
      } else {
        toast.error(`Échec : ${mutationError.message}`);
      }
      return;
    }

    const afterRes = await supabase.rpc("diagnose_playlist_impact", { _playlist_id: playlistId });
    if (afterRes.error) {
      console.warn("[PlaylistDebug] assignment diag after error", afterRes.error);
      toast.warning(`Assignation OK mais diagnostic after indisponible : ${afterRes.error.message}`);
      fetchAll();
      return;
    }
    const afterImpacted = ((afterRes.data as { impacted_headsets?: Array<{ headset_id: string; desired_manifest_version?: number }> })?.impacted_headsets) ?? [];
    console.info("[PlaylistDebug] impacted_headsets_after", afterImpacted);

    const scopeDiff = computeScopeUnionDiff(beforeImpacted, afterImpacted);
    console.info("[PlaylistDebug] scope_union_diff", scopeDiff);

    const beforeDesired = new Map(beforeImpacted.map((h) => [h.headset_id, h.desired_manifest_version ?? 0]));
    const removed = scopeDiff.filter((d) => d.scope === "removed_from_scope");
    if (removed.length > 0) {
      const ids = removed.map((r) => r.headset_id);
      const { data: bumpedRows } = await supabase
        .from("headsets")
        .select("id, desired_manifest_version")
        .in("id", ids);
      for (const row of bumpedRows ?? []) {
        const before = beforeDesired.get(row.id) ?? 0;
        console.info("[PlaylistDebug] removed_headset_bump", {
          headset_id: row.id,
          desired_before: before,
          desired_after: row.desired_manifest_version,
          bumped: (row.desired_manifest_version ?? 0) > before,
        });
      }
    }

    toast.success(existing ? "Assignation retirée" : "Assignation ajoutée");
    fetchAll();
  }

  if (loading) return <div className="p-6 text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Playlists</h1>
        <p className="text-sm text-muted-foreground">Regroupez les vidéos puis assignez-les aux casques ou groupes.</p>
      </div>

      {isAdmin && (
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
            placeholder="Nom de la playlist"
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-border/50 focus:outline-none focus:border-[hsl(var(--vr-violet))]"
          />
          <button onClick={createPlaylist} className="px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white flex items-center gap-2 hover:opacity-90 transition">
            <Plus size={16} /> Créer
          </button>
        </div>
      )}

      {playlists.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-xl">
          <ListVideo className="mx-auto mb-3 text-muted-foreground/50" size={32} />
          <p className="text-muted-foreground">Aucune playlist.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {playlists.map((pl) => {
            const items = pvideos.filter((x) => x.playlist_id === pl.id);
            const assigns = assignments.filter((a) => a.playlist_id === pl.id);
            const isEditing = editing === pl.id;
            return (
              <div key={pl.id} className="p-4 rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{pl.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {items.length} vidéo{items.length !== 1 ? "s" : ""} • {assigns.length} assignation{assigns.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditing(isEditing ? null : pl.id)} className="text-xs text-[hsl(var(--vr-violet))] hover:underline">
                        {isEditing ? "Fermer" : "Éditer"}
                      </button>
                      <button onClick={() => deletePlaylist(pl.id, pl.name)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="mt-4 pt-4 border-t border-border/30 grid md:grid-cols-2 gap-6">
                    {/* Videos picker */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Vidéos</p>
                      <div className="space-y-1 max-h-72 overflow-y-auto">
                        {videos.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Aucune vidéo en bibliothèque.</p>
                        ) : videos.map((v) => {
                          const present = items.some((i) => i.video_id === v.id);
                          return (
                            <button
                              key={v.id}
                              onClick={() => toggleVideo(pl.id, v.id, present)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded text-sm hover:bg-muted/40 transition"
                            >
                              <span className="truncate">{v.name}</span>
                              {present && <Check size={14} className="text-[hsl(140_70%_55%)]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Targets */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Diffuser à</p>
                      <div className="space-y-1 max-h-72 overflow-y-auto">
                        <TargetRow
                          icon={<Globe2 size={14} />}
                          label="Tous les casques"
                          active={assigns.some((a) => a.target_type === "all")}
                          onClick={() => toggleAssignment(pl.id, "all", null)}
                        />
                        {groups.length > 0 && <p className="text-[10px] text-muted-foreground/60 mt-2 mb-1">GROUPES</p>}
                        {groups.map((g) => (
                          <TargetRow
                            key={g.id}
                            icon={<FolderTree size={14} />}
                            label={g.name}
                            active={assigns.some((a) => a.target_type === "group" && a.target_id === g.id)}
                            onClick={() => toggleAssignment(pl.id, "group", g.id)}
                          />
                        ))}
                        {headsets.length > 0 && <p className="text-[10px] text-muted-foreground/60 mt-2 mb-1">CASQUES</p>}
                        {headsets.map((h) => (
                          <TargetRow
                            key={h.id}
                            icon={<HeadsetIcon size={14} />}
                            label={h.name}
                            active={assigns.some((a) => a.target_type === "headset" && a.target_id === h.id)}
                            onClick={() => toggleAssignment(pl.id, "headset", h.id)}
                          />
                        ))}
                      </div>
                    </div>
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

function TargetRow({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 rounded text-sm hover:bg-muted/40 transition"
    >
      <span className="flex items-center gap-2"><span className="text-muted-foreground">{icon}</span>{label}</span>
      {active && <Check size={14} className="text-[hsl(140_70%_55%)]" />}
    </button>
  );
}