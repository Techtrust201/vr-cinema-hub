import type { Projection } from "@/lib/legacyVideoFormat";

/**
 * Orientation d'un film 180/360 : où se trouve le sujet par rapport au centre de l'image,
 * en degrés, positif vers la droite. Le casque fait pivoter la sphère pour l'amener face au
 * spectateur au lancement.
 *
 * Le centre de l'image étant ce que le casque montre devant soi, c'est aussi l'endroit où
 * l'on voit le sujet apparaître, casque sur la tête, avant tout réglage : l'exploitant n'a
 * qu'à reporter ce qu'il observe.
 */

/**
 * Amplitude permise. Un 180 ne couvre que la moitié de l'espace : le tourner de plus d'un
 * quart de tour placerait le noir hors de l'image face au spectateur.
 */
export function yawLimit(projection: Projection): number {
  if (projection === "360") return 180;
  if (projection === "180") return 90;
  return 0;
}

/** Valeur enregistrable : en degrés entiers, dans ]-180, 180] pour un 360, [-90, 90] pour un 180. */
export function normalizeYawOffset(degrees: number, projection: Projection): number {
  const limit = yawLimit(projection);
  if (limit === 0 || !Number.isFinite(degrees)) return 0;

  let d = Math.round(degrees);
  if (projection === "360") {
    d %= 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
  } else {
    d = Math.max(-limit, Math.min(limit, d));
  }
  // -0 s'afficherait « -0° » dans le curseur.
  return d === 0 ? 0 : d;
}

export function describeYawOffset(degrees: number): string {
  const d = Math.round(degrees);
  if (d === 0) return "au centre de l'image — aucune rotation";
  if (Math.abs(d) === 180) return "derrière le spectateur";
  return d > 0 ? `${d}° à droite` : `${-d}° à gauche`;
}

export function yawPresets(projection: Projection): { label: string; value: number }[] {
  if (projection === "360") {
    return [
      { label: "À gauche", value: -90 },
      { label: "Au centre", value: 0 },
      { label: "À droite", value: 90 },
      { label: "Derrière", value: 180 },
    ];
  }
  if (projection === "180") {
    return [
      { label: "À gauche", value: -45 },
      { label: "Au centre", value: 0 },
      { label: "À droite", value: 45 },
    ];
  }
  return [];
}
