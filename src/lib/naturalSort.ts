/**
 * Tri « naturel » des titres, celui qu'attend un exploitant : « Voyage 2 » avant
 * « Voyage 10 », sans distinguer majuscules ni accents.
 *
 * C'est la même règle que la collation `fr_natural` de la base, qui range les playlists
 * existantes lors de la migration : un tri A→Z depuis le tableau de bord donne donc le même
 * ordre que celui choisi par la base.
 */
const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

export function compareNatural(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Copie triée : l'ordre affiché reste celui de la base tant que rien n'est enregistré. */
export function sortNatural<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareNatural(key(a), key(b)));
}
