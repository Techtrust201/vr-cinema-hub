import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveData } from "@/hooks/useLiveData";
import { useConfirm } from "@/hooks/useConfirm";
import { ListVideo, Plus, Trash2, Loader2, Check, Globe2, Headset as HeadsetIcon, FolderTree, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { humanizeSupabaseError, isPermissionError } from "@/lib/supabaseErrors";

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

type PlaylistsSnapshot = {
  playlists: Playlist[];
  videos: Video[];
  pvideos: PlaylistVideo[];
  headsets: Headset[];
  groups: Group[];
  assignments: Assignment[];
};

export default function Playlists() {
  const { canManageContent } = useAuth();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, true>>({});
  const { confirm, confirmDialog } = useConfirm();

  const { data, initialLoading, error, refresh, mutate } = useLiveData<PlaylistsSnapshot>(
    async (signal) => {
      const [p, v, pv, h, g, a] = await Promise.all([
        supabase.from("playlists").select("*").order("name").abortSignal(signal),
        supabase.from("videos").select("id, name").order("name").abortSignal(signal),
        supabase.from("playlist_videos").select("*").abortSignal(signal),
        supabase.from("headsets").select("id, name").eq("status", "active").order("name").abortSignal(signal),
        supabase.from("headset_groups").select("id, name").order("name").abortSignal(signal),
        supabase.from("assignments").select("*").abortSignal(signal),
      ]);
      const failure = p.error ?? v.error ?? pv.error ?? h.error ?? g.error ?? a.error;
      if (failure) throw new Error(failure.message);
      return {
        playlists: (p.data ?? []) as Playlist[],
        videos: (v.data ?? []) as Video[],
        pvideos: (pv.data ?? []) as PlaylistVideo[],
        headsets: (h.data ?? []) as Headset[],
        groups: (g.data ?? []) as Group[],
        assignments: (a.data ?? []) as Assignment[],
      };
    },
  );

  const playlists = data?.playlists ?? [];
  const videos = data?.videos ?? [];
  const pvideos = data?.pvideos ?? [];
  const headsets = data?.headsets ?? [];
  const groups = data?.groups ?? [];
  const assignments = data?.assignments ?? [];

  const withBusy = async (key: string, action: () => Promise<void>) => {
    if (busy[key]) return;
    setBusy((s) => ({ ...s, [key]: true }));
    try {
      await action();
    } finally {
      setBusy((s) => {
        const { [key]: _dropped, ...rest } = s;
        return rest;
      });
    }
  };

  async function createPlaylist() {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("playlists").insert({ name });
    if (error) {
      toast.error(humanizeSupabaseError(error, "La playlist n'a pas pu être créée."));
      return;
    }
    setNewName("");
    toast.success("Playlist créée");
    void refresh();
  }

  async function deletePlaylist(id: string, name: string) {
    const ok = await confirm({
      title: `Supprimer la playlist « ${name} » ?`,
      description: "Les vidéos restent en bibliothèque, seule la playlist et ses assignations sont supprimées.",
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (!ok) return;

    const previous = data;
    mutate((current) =>
      current
        ? {
            ...current,
            playlists: current.playlists.filter((p) => p.id !== id),
            pvideos: current.pvideos.filter((x) => x.playlist_id !== id),
            assignments: current.assignments.filter((a) => a.playlist_id !== id),
          }
        : current,
    );
    const { error } = await supabase.from("playlists").delete().eq("id", id);
    if (error) {
      mutate(() => previous);
      toast.error(humanizeSupabaseError(error, "La modification n'a pas pu être enregistrée."));
      return;
    }
    toast.success("Supprimée");
  }

  /**
   * One write per click. This used to fire two diagnose_playlist_impact RPCs, a
   * confirmation read and a full six-query refetch around every checkbox, which
   * is what made the page feel frozen for seconds at a time. Manifest bumping is
   * enforced by database triggers and auditable from the Sync page's Diag panel.
   */
  async function toggleVideo(playlistId: string, videoId: string, present: boolean) {
    await withBusy(`v:${playlistId}:${videoId}`, async () => {
      const previous = data;
      const nextPosition =
        Math.max(0, ...pvideos.filter((x) => x.playlist_id === playlistId).map((x) => x.position)) + 1;

      mutate((current) => {
        if (!current) return current;
        const pvideos = present
          ? current.pvideos.filter((x) => !(x.playlist_id === playlistId && x.video_id === videoId))
          : [...current.pvideos, { playlist_id: playlistId, video_id: videoId, position: nextPosition }];
        return { ...current, pvideos };
      });

      const query = present
        ? supabase.from("playlist_videos").delete().match({ playlist_id: playlistId, video_id: videoId })
        : supabase.from("playlist_videos").insert({ playlist_id: playlistId, video_id: videoId, position: nextPosition });
      const { error } = await query;

      if (error) {
        mutate(() => previous);
        toast.error(isPermissionError(error)
          ? "Modification non enregistrée : droits insuffisants."
          : `Échec : ${error.message}`);
        return;
      }
      toast.success(present ? "Vidéo retirée" : "Vidéo ajoutée");
    });
  }

  async function toggleAssignment(playlistId: string, targetType: "headset" | "group" | "all", targetId: string | null) {
    await withBusy(`a:${playlistId}:${targetType}:${targetId ?? "all"}`, async () => {
      const existing = assignments.find((a) =>
        a.playlist_id === playlistId && a.target_type === targetType && a.target_id === targetId,
      );

      if (!existing && pvideos.filter((x) => x.playlist_id === playlistId).length === 0) {
        toast.warning("Cette playlist est vide — ajoutez au moins une vidéo avant de la diffuser.");
        return;
      }

      const previous = data;
      if (existing) {
        mutate((current) =>
          current
            ? { ...current, assignments: current.assignments.filter((a) => a.id !== existing.id) }
            : current,
        );
        const { error } = await supabase.from("assignments").delete().eq("id", existing.id);
        if (error) {
          mutate(() => previous);
          toast.error(isPermissionError(error)
            ? "Modification non enregistrée : droits insuffisants."
            : `Échec : ${error.message}`);
          return;
        }
        toast.success("Assignation retirée");
        return;
      }

      // The row id is generated server-side, so the inserted row is returned and
      // reconciled in the same round-trip rather than triggering a full refetch.
      const optimisticId = `optimistic-${crypto.randomUUID()}`;
      mutate((current) =>
        current
          ? {
              ...current,
              assignments: [
                ...current.assignments,
                { id: optimisticId, playlist_id: playlistId, target_type: targetType, target_id: targetId },
              ],
            }
          : current,
      );
      const { data: inserted, error } = await supabase
        .from("assignments")
        .insert({ playlist_id: playlistId, target_type: targetType, target_id: targetId })
        .select("id, playlist_id, target_type, target_id")
        .maybeSingle();
      if (error || !inserted) {
        mutate(() => previous);
        toast.error(error && isPermissionError(error)
          ? "Modification non enregistrée : droits insuffisants."
          : `Échec : ${error?.message ?? "assignation non confirmée"}`);
        return;
      }
      mutate((current) =>
        current
          ? {
              ...current,
              assignments: current.assignments.map((a) =>
                a.id === optimisticId ? (inserted as Assignment) : a,
              ),
            }
          : current,
      );
      toast.success("Assignation ajoutée");
    });
  }

  if (initialLoading) return <div className="p-6 text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Playlists</h1>
        <p className="text-sm text-muted-foreground">Regroupez les vidéos puis assignez-les aux casques ou groupes.</p>
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
                  {canManageContent && (
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
                          const pending = busy[`v:${pl.id}:${v.id}`] === true;
                          return (
                            <button
                              key={v.id}
                              disabled={pending}
                              onClick={() => toggleVideo(pl.id, v.id, present)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded text-sm hover:bg-muted/40 transition disabled:opacity-60"
                            >
                              <span className="truncate">{v.name}</span>
                              {pending
                                ? <Loader2 size={14} className="animate-spin text-muted-foreground" />
                                : present && <Check size={14} className="text-[hsl(140_70%_55%)]" />}
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
                          pending={busy[`a:${pl.id}:all:all`] === true}
                          onClick={() => toggleAssignment(pl.id, "all", null)}
                        />
                        {groups.length > 0 && <p className="text-[10px] text-muted-foreground/60 mt-2 mb-1">GROUPES</p>}
                        {groups.map((g) => (
                          <TargetRow
                            key={g.id}
                            icon={<FolderTree size={14} />}
                            label={g.name}
                            active={assigns.some((a) => a.target_type === "group" && a.target_id === g.id)}
                            pending={busy[`a:${pl.id}:group:${g.id}`] === true}
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
                            pending={busy[`a:${pl.id}:headset:${h.id}`] === true}
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
      {confirmDialog}
    </div>
  );
}

function TargetRow({ icon, label, active, pending, onClick }: { icon: React.ReactNode; label: string; active: boolean; pending: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="w-full flex items-center justify-between px-3 py-2 rounded text-sm hover:bg-muted/40 transition disabled:opacity-60"
    >
      <span className="flex items-center gap-2"><span className="text-muted-foreground">{icon}</span>{label}</span>
      {pending
        ? <Loader2 size={14} className="animate-spin text-muted-foreground" />
        : active && <Check size={14} className="text-[hsl(140_70%_55%)]" />}
    </button>
  );
}