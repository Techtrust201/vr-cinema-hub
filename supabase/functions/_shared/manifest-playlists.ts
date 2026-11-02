// Ordre des dossiers et des vidéos que le casque présente.
//
// Le casque ne trie rien : il affiche les playlists dans l'ordre du tableau `playlists` du
// manifeste et lit les vidéos d'un dossier dans l'ordre de `video_ids`. Tout l'ordre est
// donc décidé ici, à partir des positions écrites depuis le tableau de bord.

export type PlaylistRow = { id: string; name: string; position: number | null };

export type PlaylistVideoRow = {
  playlist_id: string;
  video_id: string;
  position: number | null;
  name?: string | null;
};

export type ManifestPlaylist = {
  id: string;
  name: string;
  /** Rang du dossier, à partir de 1 : le tableau est déjà dans cet ordre. */
  position: number;
  video_ids: string[];
};

// Même règle que la collation `fr_natural` de la base, pour départager deux positions égales
// (deux playlists créées au même instant) comme le ferait un tri A→Z.
const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

export function orderPlaylists<T extends PlaylistRow>(playlists: readonly T[]): T[] {
  return [...playlists].sort((a, b) =>
    (a.position ?? 0) - (b.position ?? 0) ||
    collator.compare(a.name, b.name) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Lignes playlist_videos dans l'ordre de présentation : dossier par dossier, puis position
 * dans le dossier. C'est aussi l'ordre de téléchargement, si bien que le premier dossier
 * devient regardable en premier.
 */
export function orderPlaylistVideos<T extends PlaylistVideoRow>(
  rows: readonly T[],
  playlistOrder: readonly string[],
): T[] {
  const rank = new Map(playlistOrder.map((id, index) => [id, index]));
  const unranked = Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) =>
    (rank.get(a.playlist_id) ?? unranked) - (rank.get(b.playlist_id) ?? unranked) ||
    (a.position ?? 0) - (b.position ?? 0) ||
    collator.compare(a.name ?? "", b.name ?? "") ||
    a.video_id.localeCompare(b.video_id)
  );
}

/**
 * `orderedRows` doit venir de `orderPlaylistVideos`. Seules les vidéos réellement servies
 * figurent dans un dossier : le casque ne doit jamais attendre un fichier absent de `videos`.
 */
export function buildManifestPlaylists(
  orderedPlaylists: readonly PlaylistRow[],
  orderedRows: readonly PlaylistVideoRow[],
  servedVideoIds: ReadonlySet<string>,
): ManifestPlaylist[] {
  const byPlaylist = new Map<string, string[]>();
  for (const row of orderedRows) {
    if (!servedVideoIds.has(row.video_id)) continue;
    const ids = byPlaylist.get(row.playlist_id) ?? [];
    if (!ids.includes(row.video_id)) ids.push(row.video_id);
    byPlaylist.set(row.playlist_id, ids);
  }
  return orderedPlaylists.map((playlist, index) => ({
    id: playlist.id,
    name: playlist.name,
    position: index + 1,
    video_ids: byPlaylist.get(playlist.id) ?? [],
  }));
}
