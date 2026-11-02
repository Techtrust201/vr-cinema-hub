import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveData } from "@/hooks/useLiveData";
import { useConfirm } from "@/hooks/useConfirm";
import { ListVideo, Plus, Trash2, Loader2, Check, Globe2, Headset as HeadsetIcon, FolderTree, WifiOff, GripVertical, Pencil } from "lucide-react";
import { toast } from "sonner";
import { humanizeSupabaseError, isPermissionError } from "@/lib/supabaseErrors";
import { sortNatural } from "@/lib/naturalSort";
import {
  isNaturallyOrdered,
  mergeSavedOrder,
  moveId,
  savedOrderStatus,
  videosInPlaybackOrder,
} from "@/lib/playlistOrder";

interface Playlist { id: string; name: string; position: number; description: string | null; }
interface Video { id: string; name: string; title: string | null; }

/** `name` devient le titre affiché : le tri et l'ordre de lecture s'en servent. */
function videosByDisplayedTitle(videos: readonly Video[]): { id: string; name: string }[] {
  return videos.map((video) => ({
    id: video.id,
    name: video.title?.trim() || video.name,
  }));
}
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

type WriteError = { code?: string; message?: string; hint?: string | null };

/**
 * Marque un instantané produit par `mutate`, pas par un refetch.
 * `useLiveData` remplace tout l'objet au retour du réseau : le symbole disparaît,
 * et l'effet sait alors qu'il doit réappliquer un ordre déjà enregistré.
 */
const LOCAL_WRITE = Symbol("ordre-local");
type StampedSnapshot = PlaylistsSnapshot & { [LOCAL_WRITE]?: number };

const reorderInstructions = {
  draggable:
    "Pour saisir, appuyez sur espace. Pendant le déplacement, les flèches changent la position. Espace dépose, Échap annule.",
};

function localStamp(snapshot: PlaylistsSnapshot): number {
  const value = (snapshot as StampedSnapshot)[LOCAL_WRITE];
  return typeof value === "number" ? value : 0;
}

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function asWriteError(err: unknown): WriteError {
  if (err && typeof err === "object") {
    const record = err as WriteError;
    return {
      code: record.code,
      message: record.message ?? (err instanceof Error ? err.message : undefined),
      hint: record.hint,
    };
  }
  return { message: "Erreur inconnue" };
}

function describeReorderError(error: WriteError, fallback: string): string {
  if (isPermissionError(error)) return "Modification non enregistrée : droits insuffisants.";
  // Le message SQL (hint playlist_changed) est déjà en français.
  if ((error.hint === "playlist_changed" || error.code === "P0001") && error.message) return error.message;
  return humanizeSupabaseError(error, fallback);
}

/** Positions 1, 2, 3… comme `WITH ORDINALITY` dans les RPC de réordonnancement. */
function withPlaylistOrder(snapshot: PlaylistsSnapshot, savedIds: readonly string[]): PlaylistsSnapshot {
  const currentIds = snapshot.playlists.map((playlist) => playlist.id);
  const merged = mergeSavedOrder(currentIds, savedIds);
  if (
    sameSequence(merged, currentIds)
    && snapshot.playlists.every((playlist, index) => playlist.position === index + 1)
  ) {
    return snapshot;
  }
  const byId = new Map(snapshot.playlists.map((playlist) => [playlist.id, playlist]));
  const playlists = merged.flatMap((id, index) => {
    const playlist = byId.get(id);
    if (!playlist) return [];
    return [playlist.position === index + 1 ? playlist : { ...playlist, position: index + 1 }];
  });
  return { ...snapshot, playlists };
}

function withVideoOrder(snapshot: PlaylistsSnapshot, playlistId: string, savedIds: readonly string[]): PlaylistsSnapshot {
  const currentIds = videosInPlaybackOrder(
    snapshot.pvideos,
    videosByDisplayedTitle(snapshot.videos),
    playlistId,
  ).map((video) => video.id);
  const merged = mergeSavedOrder(currentIds, savedIds);
  const rank = new Map(merged.map((id, index) => [id, index + 1]));
  let changed = false;
  const pvideos = snapshot.pvideos.map((link) => {
    if (link.playlist_id !== playlistId) return link;
    const position = rank.get(link.video_id);
    if (position === undefined || position === link.position) return link;
    changed = true;
    return { ...link, position };
  });
  return changed ? { ...snapshot, pvideos } : snapshot;
}

function withSavedNames(snapshot: PlaylistsSnapshot, names: ReadonlyMap<string, string>): PlaylistsSnapshot {
  let changed = false;
  const playlists = snapshot.playlists.map((playlist) => {
    const name = names.get(playlist.id);
    if (name === undefined || playlist.name === name) return playlist;
    changed = true;
    return { ...playlist, name };
  });
  return changed ? { ...snapshot, playlists } : snapshot;
}

function restorePlaylistOrder(
  current: PlaylistsSnapshot | null,
  previousIds: readonly string[],
  previousPositions: ReadonlyMap<string, number>,
): PlaylistsSnapshot | null {
  if (!current) return current;
  const byId = new Map(current.playlists.map((playlist) => [playlist.id, playlist]));
  const playlists: Playlist[] = [];
  for (const id of previousIds) {
    const playlist = byId.get(id);
    if (!playlist) continue;
    const position = previousPositions.get(id);
    playlists.push(position === undefined || playlist.position === position ? playlist : { ...playlist, position });
  }
  for (const playlist of current.playlists) {
    if (!previousIds.includes(playlist.id)) playlists.push(playlist);
  }
  return { ...current, playlists };
}

function restoreVideoPositions(
  current: PlaylistsSnapshot | null,
  playlistId: string,
  positions: ReadonlyMap<string, number>,
): PlaylistsSnapshot | null {
  if (!current) return current;
  let changed = false;
  const pvideos = current.pvideos.map((link) => {
    if (link.playlist_id !== playlistId) return link;
    const position = positions.get(link.video_id);
    if (position === undefined || link.position === position) return link;
    changed = true;
    return { ...link, position };
  });
  return changed ? { ...current, pvideos } : current;
}

function reorderAnnouncements(labelFor: (id: string) => string): Announcements {
  const label = (id: UniqueIdentifier) => labelFor(String(id));
  return {
    onDragStart({ active }) {
      return `« ${label(active.id)} » saisi. Flèches pour déplacer, espace pour déposer, Échap pour annuler.`;
    },
    onDragOver({ active, over }) {
      if (!over) return `« ${label(active.id)} » n'est plus au-dessus d'un emplacement.`;
      return `« ${label(active.id)} » est au-dessus de « ${label(over.id)} ».`;
    },
    onDragEnd({ active, over }) {
      if (!over || active.id === over.id) return `« ${label(active.id)} » reste à sa place.`;
      return `« ${label(active.id)} » déposé à la place de « ${label(over.id)} ».`;
    },
    onDragCancel({ active }) {
      return `Déplacement de « ${label(active.id)} » annulé.`;
    },
  };
}

function useReorderSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function sortButtonTitle(natural: boolean, busy: boolean): string | undefined {
  if (!natural && !busy) return undefined;
  if (busy) return "Enregistrement de l'ordre…";
  return "Déjà dans l'ordre alphabétique";
}

export default function Playlists() {
  const { canManageContent } = useAuth();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState<Record<string, true>>({});
  const { confirm, confirmDialog } = useConfirm();
  const sensors = useReorderSensors();
  const skipRenameCommit = useRef(false);
  const renameInFlight = useRef(new Set<string>());
  const orderInFlight = useRef(new Set<string>());
  const localSeq = useRef(0);
  const seenLocalStamp = useRef(0);
  const playlistHold = useRef<string[] | null>(null);
  const videoHolds = useRef(new Map<string, string[]>());
  const nameHolds = useRef(new Map<string, string>());

  const { data, initialLoading, error, refresh, mutate } = useLiveData<PlaylistsSnapshot>(
    async (signal) => {
      const [p, v, pv, h, g, a] = await Promise.all([
        // Le casque affiche les dossiers dans cet ordre : position, puis nom.
        supabase.from("playlists").select("*").order("position").order("name").abortSignal(signal),
        supabase.from("videos").select("id, name, title").order("name").abortSignal(signal),
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

  const writeLocal = useCallback((updater: (current: PlaylistsSnapshot | null) => PlaylistsSnapshot | null) => {
    mutate((current) => {
      const next = updater(current);
      if (!next || next === current) return next;
      localSeq.current += 1;
      const stamped: StampedSnapshot = { ...next, [LOCAL_WRITE]: localSeq.current };
      return stamped;
    });
  }, [mutate]);

  // Pas de pollMs ni de realtime sur cette page : useLiveData ne rafraîchit pas
  // tout seul. refresh() (création, ou erreur d'ordre) remplace pourtant tout
  // l'instantané. Une requête partie avant l'écriture peut revenir après et
  // réafficher l'ancien ordre. Tant que le réseau n'a pas renvoyé l'ordre
  // enregistré, on le réécrit — dans useLayoutEffect, donc avant le paint.
  // On lâche la garde si un identifiant a disparu (suppression) : la liste du
  // serveur fait alors foi.
  useLayoutEffect(() => {
    if (!data) return;
    const fromLocalWrite = localStamp(data) > seenLocalStamp.current;
    if (fromLocalWrite) seenLocalStamp.current = localStamp(data);

    let applyPlaylists = false;
    if (playlistHold.current) {
      const status = savedOrderStatus(data.playlists.map((playlist) => playlist.id), playlistHold.current);
      if (status === "missing") playlistHold.current = null;
      else if (status === "match") {
        if (!fromLocalWrite) playlistHold.current = null;
      } else if (!fromLocalWrite) applyPlaylists = true;
    }

    const applyVideos: string[] = [];
    for (const [playlistId, savedIds] of [...videoHolds.current]) {
      const currentIds = videosInPlaybackOrder(
        data.pvideos,
        videosByDisplayedTitle(data.videos),
        playlistId,
      ).map((video) => video.id);
      const status = savedOrderStatus(currentIds, savedIds);
      if (status === "missing") videoHolds.current.delete(playlistId);
      else if (status === "match") {
        if (!fromLocalWrite) videoHolds.current.delete(playlistId);
      } else if (!fromLocalWrite) applyVideos.push(playlistId);
    }

    let applyNames = false;
    for (const [id, name] of [...nameHolds.current]) {
      const playlist = data.playlists.find((item) => item.id === id);
      if (!playlist) nameHolds.current.delete(id);
      else if (playlist.name === name) {
        if (!fromLocalWrite) nameHolds.current.delete(id);
      } else if (!fromLocalWrite) applyNames = true;
    }

    if (!applyPlaylists && applyVideos.length === 0 && !applyNames) return;

    writeLocal((current) => {
      if (!current) return current;
      let next = current;
      if (applyPlaylists && playlistHold.current) next = withPlaylistOrder(next, playlistHold.current);
      for (const playlistId of applyVideos) {
        const savedIds = videoHolds.current.get(playlistId);
        if (savedIds) next = withVideoOrder(next, playlistId, savedIds);
      }
      if (applyNames) next = withSavedNames(next, nameHolds.current);
      return next;
    });
  }, [data, writeLocal]);

  const playlists = data?.playlists ?? [];
  const videos = data?.videos ?? [];
  const pvideos = data?.pvideos ?? [];
  const headsets = data?.headsets ?? [];
  const groups = data?.groups ?? [];
  const assignments = data?.assignments ?? [];
  const videosForDisplay = videosByDisplayedTitle(videos);
  const libraryVideos = sortNatural(videosForDisplay, (video) => video.name);
  const playlistsNatural = isNaturallyOrdered(playlists, (playlist) => playlist.name);
  const playlistOrderBusy = busy["order:playlists"] === true;

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
    writeLocal((current) =>
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
      writeLocal(() => previous);
      toast.error(humanizeSupabaseError(error, "La modification n'a pas pu être enregistrée."));
      return;
    }
    toast.success("Supprimée");
  }

  function beginRename(playlist: Playlist) {
    skipRenameCommit.current = false;
    setDraft({ id: playlist.id, value: playlist.name });
  }

  function cancelRename() {
    skipRenameCommit.current = true;
    setDraft(null);
  }

  async function commitRename(playlist: Playlist) {
    if (skipRenameCommit.current) {
      skipRenameCommit.current = false;
      return;
    }
    if (!draft || draft.id !== playlist.id) return;
    if (renameInFlight.current.has(playlist.id)) return;
    renameInFlight.current.add(playlist.id);
    const name = draft.value.trim();
    setDraft((current) => (current?.id === playlist.id ? null : current));
    try {
      if (!name || name === playlist.name.trim()) return;
      const previousName = playlist.name;
      nameHolds.current.set(playlist.id, name);
      writeLocal((current) => {
        if (!current) return current;
        return {
          ...current,
          playlists: current.playlists.map((item) => item.id === playlist.id ? { ...item, name } : item),
        };
      });
      const { data: updated, error } = await supabase
        .from("playlists")
        .update({ name })
        .eq("id", playlist.id)
        .select("id")
        .maybeSingle();
      if (error || !updated) {
        nameHolds.current.delete(playlist.id);
        writeLocal((current) => {
          if (!current) return current;
          return {
            ...current,
            playlists: current.playlists.map((item) => item.id === playlist.id ? { ...item, name: previousName } : item),
          };
        });
        toast.error(humanizeSupabaseError(error, "Le nom n'a pas pu être enregistré."));
        return;
      }
      toast.success("Playlist renommée");
    } catch (err) {
      nameHolds.current.delete(playlist.id);
      writeLocal((current) => {
        if (!current) return current;
        return {
          ...current,
          playlists: current.playlists.map((item) => item.id === playlist.id ? { ...item, name: playlist.name } : item),
        };
      });
      toast.error(humanizeSupabaseError(asWriteError(err), "Le nom n'a pas pu être enregistré."));
    } finally {
      renameInFlight.current.delete(playlist.id);
    }
  }

  async function persistPlaylistOrder(ids: readonly string[]) {
    const key = "order:playlists";
    if (orderInFlight.current.has(key) || !data) return;
    orderInFlight.current.add(key);
    const nextIds = [...ids];
    const previousIds = data.playlists.map((playlist) => playlist.id);
    const previousPositions = new Map(data.playlists.map((playlist) => [playlist.id, playlist.position]));
    try {
      await withBusy(key, async () => {
        const fail = async (err: unknown) => {
          playlistHold.current = null;
          writeLocal((current) => restorePlaylistOrder(current, previousIds, previousPositions));
          toast.error(describeReorderError(asWriteError(err), "L'ordre des playlists n'a pas pu être enregistré."));
          await refresh();
        };
        playlistHold.current = nextIds;
        writeLocal((current) => (current ? withPlaylistOrder(current, nextIds) : current));
        try {
          const { error } = await supabase.rpc("reorder_playlists", { _playlist_ids: nextIds });
          if (error) {
            await fail(error);
            return;
          }
          toast.message("Ordre enregistré");
        } catch (err) {
          await fail(err);
        }
      });
    } finally {
      orderInFlight.current.delete(key);
    }
  }

  async function persistVideoOrder(playlistId: string, ids: readonly string[]) {
    const key = `order:videos:${playlistId}`;
    if (orderInFlight.current.has(key) || !data) return;
    orderInFlight.current.add(key);
    const nextIds = [...ids];
    const previous = new Map(
      data.pvideos.filter((link) => link.playlist_id === playlistId).map((link) => [link.video_id, link.position]),
    );
    try {
      await withBusy(key, async () => {
        const fail = async (err: unknown) => {
          videoHolds.current.delete(playlistId);
          writeLocal((current) => restoreVideoPositions(current, playlistId, previous));
          toast.error(describeReorderError(asWriteError(err), "L'ordre de lecture n'a pas pu être enregistré."));
          await refresh();
        };
        videoHolds.current.set(playlistId, nextIds);
        writeLocal((current) => (current ? withVideoOrder(current, playlistId, nextIds) : current));
        try {
          const { error } = await supabase.rpc("reorder_playlist_videos", {
            _playlist_id: playlistId,
            _video_ids: nextIds,
          });
          if (error) {
            await fail(error);
            return;
          }
          toast.message("Ordre enregistré");
        } catch (err) {
          await fail(err);
        }
      });
    } finally {
      orderInFlight.current.delete(key);
    }
  }

  function onPlaylistDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = playlists.map((playlist) => playlist.id);
    const next = moveId(ids, String(active.id), String(over.id));
    if (sameSequence(next, ids)) return;
    void persistPlaylistOrder(next);
  }

  function sortPlaylistsAz() {
    const next = sortNatural(playlists, (playlist) => playlist.name).map((playlist) => playlist.id);
    if (sameSequence(next, playlists.map((playlist) => playlist.id))) return;
    void persistPlaylistOrder(next);
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

      writeLocal((current) => {
        if (!current) return current;
        const nextVideos = present
          ? current.pvideos.filter((x) => !(x.playlist_id === playlistId && x.video_id === videoId))
          : [...current.pvideos, { playlist_id: playlistId, video_id: videoId, position: nextPosition }];
        return { ...current, pvideos: nextVideos };
      });

      const query = present
        ? supabase.from("playlist_videos").delete().match({ playlist_id: playlistId, video_id: videoId })
        : supabase.from("playlist_videos").insert({ playlist_id: playlistId, video_id: videoId, position: nextPosition });
      const { error } = await query;

      if (error) {
        writeLocal(() => previous);
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
        writeLocal((current) =>
          current
            ? { ...current, assignments: current.assignments.filter((a) => a.id !== existing.id) }
            : current,
        );
        const { error } = await supabase.from("assignments").delete().eq("id", existing.id);
        if (error) {
          writeLocal(() => previous);
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
      writeLocal((current) =>
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
        writeLocal(() => previous);
        toast.error(error && isPermissionError(error)
          ? "Modification non enregistrée : droits insuffisants."
          : `Échec : ${error?.message ?? "assignation non confirmée"}`);
        return;
      }
      writeLocal((current) =>
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

  const playlistLabel = (id: string) => playlists.find((playlist) => playlist.id === id)?.name ?? "cette playlist";

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
          <button onClick={createPlaylist} className="px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-[hsl(var(--primary-foreground))] flex items-center gap-2 hover:opacity-90 transition">
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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="playlist-order-help" className="text-xs text-muted-foreground">
              Le casque affiche les playlists dans cet ordre.
            </p>
            {canManageContent && (
              <SortAlphabeticallyButton
                disabled={playlistsNatural || playlistOrderBusy}
                title={sortButtonTitle(playlistsNatural, playlistOrderBusy)}
                onClick={sortPlaylistsAz}
              />
            )}
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={{
              announcements: reorderAnnouncements(playlistLabel),
              screenReaderInstructions: reorderInstructions,
            }}
            onDragEnd={onPlaylistDragEnd}
          >
            <SortableContext items={playlists.map((playlist) => playlist.id)} strategy={verticalListSortingStrategy}>
              <div className="grid gap-3" aria-describedby="playlist-order-help">
                {playlists.map((pl) => {
                  const playback = videosInPlaybackOrder(pvideos, videosForDisplay, pl.id);
                  const assigns = assignments.filter((a) => a.playlist_id === pl.id);
                  const isEditing = editing === pl.id;
                  const videoOrderBusy = busy[`order:videos:${pl.id}`] === true;
                  return (
                    <SortableCard key={pl.id} id={pl.id} disabled={!canManageContent || playlistOrderBusy}>
                      {(drag) => (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              {canManageContent && (
                                <DragHandle
                                  className="mt-0.5"
                                  label={`Déplacer la playlist « ${pl.name} »`}
                                  attributes={drag.attributes}
                                  listeners={drag.listeners}
                                  disabled={playlistOrderBusy}
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                {draft?.id === pl.id ? (
                                  <input
                                    autoFocus
                                    value={draft.value}
                                    onChange={(event) => setDraft({ id: pl.id, value: event.target.value })}
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={() => { void commitRename(pl); }}
                                    onKeyDown={(event) => {
                                      event.stopPropagation();
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        event.currentTarget.blur();
                                      } else if (event.key === "Escape") {
                                        event.preventDefault();
                                        cancelRename();
                                      }
                                    }}
                                    aria-label={`Nom de la playlist « ${pl.name} »`}
                                    className="w-full rounded-md border border-border/50 bg-background px-2 py-1 font-semibold focus:border-[hsl(var(--vr-violet))] focus:outline-none"
                                  />
                                ) : (
                                  <div className="flex min-w-0 items-center gap-1">
                                    <p className="truncate font-semibold">{pl.name}</p>
                                    {canManageContent && (
                                      <button
                                        type="button"
                                        onClick={() => beginRename(pl)}
                                        className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                                        aria-label={`Renommer « ${pl.name} »`}
                                      >
                                        <Pencil size={14} />
                                      </button>
                                    )}
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {playback.length} vidéo{playback.length !== 1 ? "s" : ""} • {assigns.length} assignation{assigns.length !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </div>
                            {canManageContent && (
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setEditing(isEditing ? null : pl.id)} className="text-xs text-[hsl(var(--vr-violet))] hover:underline">
                                  {isEditing ? "Fermer" : "Éditer"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deletePlaylist(pl.id, pl.name)}
                                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                                  aria-label={`Supprimer la playlist « ${pl.name} »`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>

                          {isEditing && (
                            <div className="mt-4 grid grid-cols-1 gap-6 border-t border-border/30 pt-4 lg:grid-cols-3">
                              <VideoOrder
                                playlistId={pl.id}
                                items={playback}
                                canManage={canManageContent}
                                busy={videoOrderBusy}
                                onReorder={(ids) => { void persistVideoOrder(pl.id, ids); }}
                                onSort={() => {
                                  const next = sortNatural(playback, (video) => video.name).map((video) => video.id);
                                  if (!sameSequence(next, playback.map((video) => video.id))) void persistVideoOrder(pl.id, next);
                                }}
                              />

                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Vidéos</p>
                                <div className="space-y-1 max-h-72 overflow-y-auto">
                                  {libraryVideos.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Aucune vidéo en bibliothèque.</p>
                                  ) : libraryVideos.map((v) => {
                                    const present = playback.some((item) => item.id === v.id);
                                    const pending = busy[`v:${pl.id}:${v.id}`] === true;
                                    return (
                                      <button
                                        key={v.id}
                                        type="button"
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

                              <div className="min-w-0">
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
                        </>
                      )}
                    </SortableCard>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function DragHandle({
  label,
  attributes,
  listeners,
  disabled,
  className,
}: {
  label: string;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
      {...attributes}
      {...listeners}
      aria-label={label}
      disabled={disabled}
    >
      <GripVertical size={16} />
    </button>
  );
}

function SortAlphabeticallyButton({ disabled, title, onClick }: { disabled: boolean; title?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="shrink-0 rounded-md border border-border/50 px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      Trier A→Z
    </button>
  );
}

function SortableCard({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: (drag: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))] p-4 ${isDragging ? "z-10 opacity-60" : ""}`}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

function PlaybackRow({ index, name, handle, dragging }: { index: number; name: string; handle?: ReactNode; dragging?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded px-2 py-1.5 ${dragging ? "opacity-60" : ""}`}>
      {handle}
      <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index}</span>
      <span className="truncate text-sm">{name || "Vidéo indisponible"}</span>
    </div>
  );
}

function SortablePlaybackRow({ id, position, name, disabled }: { id: string; position: number; name: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PlaybackRow
        index={position}
        name={name}
        dragging={isDragging}
        handle={(
          <DragHandle
            label={`Déplacer « ${name || "cette vidéo"} » dans l'ordre de lecture`}
            attributes={attributes}
            listeners={listeners}
            disabled={disabled}
          />
        )}
      />
    </div>
  );
}

function VideoOrder({
  playlistId,
  items,
  canManage,
  busy,
  onReorder,
  onSort,
}: {
  playlistId: string;
  items: { id: string; name: string }[];
  canManage: boolean;
  busy: boolean;
  onReorder: (ids: string[]) => void;
  onSort: () => void;
}) {
  const sensors = useReorderSensors();
  const natural = isNaturallyOrdered(items, (item) => item.name);
  const helpId = `lecture-${playlistId}`;
  const labelFor = (id: string) => items.find((item) => item.id === id)?.name || "cette vidéo";

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((item) => item.id);
    const next = moveId(ids, String(active.id), String(over.id));
    if (sameSequence(next, ids)) return;
    onReorder(next);
  }

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Ordre de lecture</p>
        {canManage && (
          <SortAlphabeticallyButton
            disabled={natural || busy}
            title={sortButtonTitle(natural, busy)}
            onClick={onSort}
          />
        )}
      </div>
      <p id={helpId} className="mb-2 text-xs text-muted-foreground">
        Le casque lit ces vidéos dans cet ordre, l'une après l'autre.
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune vidéo dans cette playlist.</p>
      ) : canManage ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements: reorderAnnouncements(labelFor),
            screenReaderInstructions: reorderInstructions,
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <div className="max-h-72 space-y-1 overflow-y-auto" aria-describedby={helpId}>
              {items.map((video, index) => (
                <SortablePlaybackRow key={video.id} id={video.id} position={index + 1} name={video.name} disabled={busy} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto" aria-describedby={helpId}>
          {items.map((video, index) => (
            <PlaybackRow key={video.id} index={index + 1} name={video.name} />
          ))}
        </div>
      )}
    </div>
  );
}

function TargetRow({ icon, label, active, pending, onClick }: { icon: ReactNode; label: string; active: boolean; pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
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
