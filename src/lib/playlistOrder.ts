/**
 * Ordre des playlists et de leurs vidéos, tel que le casque les présente.
 *
 * Le glisser-déposer et le bouton « Trier A→Z » ne font que produire une nouvelle
 * liste d'identifiants. L'enregistrement est une RPC qui réécrit `position`.
 * Ici, aucune écriture : seulement l'ordre à afficher et à envoyer.
 */
import { compareNatural } from "./naturalSort";

/**
 * Déplace `activeId` à la place de `overId`.
 *
 * Même résultat qu'`arrayMove` de dnd-kit quand les deux identifiants sont dans
 * la liste. Si l'un manque, on renvoie une copie inchangée : `arrayMove` sur un
 * index -1 retirerait le dernier élément.
 */
export function moveId(ids: readonly string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  const moved = next[from];
  if (moved === undefined) return [...ids];
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Vrai quand la liste est déjà dans l'ordre de `sortNatural` pour `key`. */
export function isNaturallyOrdered<T>(items: readonly T[], key: (item: T) => string): boolean {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (previous === undefined || current === undefined) continue;
    if (compareNatural(key(previous), key(current)) > 0) return false;
  }
  return true;
}

export interface PlaylistVideoLink {
  playlist_id: string;
  video_id: string;
  position: number;
}

export interface NamedVideo {
  id: string;
  name: string;
}

export interface PlaybackVideo {
  id: string;
  name: string;
  position: number;
}

/**
 * Vidéos d'une playlist dans l'ordre de lecture du casque : `position` croissante,
 * et à position égale le nom (tri naturel), comme le départage du manifeste.
 * Une vidéo absente de la bibliothèque reste dans la liste (nom vide) : la RPC
 * exige tous les identifiants actuellement liés.
 */
export function videosInPlaybackOrder(
  links: readonly PlaylistVideoLink[],
  videos: readonly NamedVideo[],
  playlistId: string,
): PlaybackVideo[] {
  const names = new Map(videos.map((video) => [video.id, video.name]));
  return links
    .filter((link) => link.playlist_id === playlistId)
    .map((link) => ({
      id: link.video_id,
      name: names.get(link.video_id) ?? "",
      position: link.position,
    }))
    .sort((a, b) => a.position - b.position || compareNatural(a.name, b.name));
}

/**
 * Compare un ordre déjà enregistré à la liste actuellement affichée.
 * Un élément apparu entre-temps (création) ne compte pas comme un désaccord
 * tant que les identifiants enregistrés sont tous là, dans le même ordre relatif.
 */
export function savedOrderStatus(
  currentIds: readonly string[],
  savedIds: readonly string[],
): "missing" | "match" | "differs" {
  const current = new Set(currentIds);
  if (savedIds.some((id) => !current.has(id))) return "missing";
  const saved = new Set(savedIds);
  const currentSaved: string[] = [];
  for (const id of currentIds) {
    if (saved.has(id)) currentSaved.push(id);
  }
  for (let index = 0; index < savedIds.length; index += 1) {
    if (currentSaved[index] !== savedIds[index]) return "differs";
  }
  return "match";
}

/**
 * Réapplique l'ordre enregistré et place à la fin ce qui est arrivé après
 * (une playlist ou une vidéo créée entre-temps). Les identifiants enregistrés
 * qui ont disparu sont omis.
 */
export function mergeSavedOrder(currentIds: readonly string[], savedIds: readonly string[]): string[] {
  const current = new Set(currentIds);
  const kept = savedIds.filter((id) => current.has(id));
  const keptSet = new Set(kept);
  const extras: string[] = [];
  for (const id of currentIds) {
    if (!keptSet.has(id)) extras.push(id);
  }
  return [...kept, ...extras];
}
