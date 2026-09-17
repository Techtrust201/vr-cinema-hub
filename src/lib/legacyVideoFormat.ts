export type Projection = "360" | "180" | "flat";
export type StereoMode = "mono" | "top_bottom" | "side_by_side" | "unknown";
export type VrFormat = "360_mono" | "180_mono" | "360_stereo" | "180_stereo" | "flat";

/**
 * Traduit la projection et le relief en `videos.format`.
 *
 * Le casque choisit sa surface d'affichage d'après cette seule colonne, héritée d'avant
 * la séparation en trois champs. Toute écriture d'un film doit donc la maintenir en
 * accord avec `projection` et `stereo_mode` : un format resté en arrière afficherait un
 * film à plat sur une sphère, ou l'inverse.
 *
 * Vit ici plutôt que dans le composant pour être vérifiable par des tests : c'est la
 * pièce qui décide de ce que voit le spectateur.
 */
export function legacyFormatFor(projection: Projection, stereo: StereoMode): VrFormat {
  if (projection === "flat") return "flat";
  // « unknown » vient des fichiers dont le relief n'a pas pu être déduit du nom. Les
  // traiter comme du relief est le bon défaut : un film plat affiché en relief reste
  // regardable, alors qu'un film en relief affiché à plat montre les deux yeux côte à
  // côte et devient inutilisable.
  const isStereo = stereo !== "mono";
  if (projection === "180") return isStereo ? "180_stereo" : "180_mono";
  return isStereo ? "360_stereo" : "360_mono";
}
