import type { Projection, SourceLayout } from "@/lib/detectVideoFormat";

export type InferredFormatFromName = {
  projection: Projection;
  stereoMode: "mono" | "top_bottom" | "side_by_side" | "unknown";
  sourceLayout: SourceLayout;
  /**
   * Le nom porte les réglages Skybox (ou un équivalent explicite). On peut s'en servir
   * quand le navigateur ne décode pas le fichier, sans prendre un `clip.mp4` au hasard.
   */
  named: boolean;
};

function fold(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Skybox écrit le format dans le nom de fichier. « 2D single » est le mono, pas un
 * écran de cinéma — traiter « 2d » comme « plat » envoyait les 360 Paris sur un écran.
 */
export function inferFormatFromFilename(name: string): InferredFormatFromName {
  const n = fold(name);

  const cinema = /\bcinema\b/.test(n) || n.includes("ecran plat") || n.includes("flat screen");
  const vr360 = n.includes("vr360") || /\b360\b/.test(n);
  const vr180 = n.includes("vr180") || /\b180\b/.test(n);
  const youtube = n.includes("youtube") || n.includes("cubemap") || /\beac\b/.test(n);
  const skybox = n.includes("skybox") || n.includes("ordinaire");
  const topBottom =
    /haut[\s_-]*bas/.test(n) ||
    /top[\s_-]*bottom/.test(n) ||
    n.includes("topbottom") ||
    n.includes("_ou");
  const sideBySide =
    /side[\s_-]*by[\s_-]*side/.test(n) || n.includes("sbs");

  let projection: Projection = "360";
  if (cinema) projection = "flat";
  else if (vr180 && !vr360) projection = "180";
  else if (vr360) projection = "360";

  let stereoMode: InferredFormatFromName["stereoMode"] = "mono";
  if (topBottom) stereoMode = "top_bottom";
  else if (sideBySide) stereoMode = "side_by_side";
  else if (/\b3d\b/.test(n) && !/2d\s*single/.test(n) && !cinema) stereoMode = "unknown";

  const sourceLayout: SourceLayout = youtube && !cinema ? "equiangular_cubemap" : "equirectangular";

  const named = cinema || vr360 || vr180 || youtube || skybox || topBottom || sideBySide;

  return { projection, stereoMode, sourceLayout, named };
}

/**
 * Nom Skybox (ou équivalent) et relief connu : on envoie sans attendre que le
 * navigateur décode. Un 8K HEVC ou un VP9 4K gèlerait sinon l'onglet avant l'envoi.
 */
export function shouldAutoSend(inferred: InferredFormatFromName): boolean {
  if (!inferred.named) return false;
  if (inferred.projection === "flat") return true;
  return inferred.stereoMode !== "unknown";
}
