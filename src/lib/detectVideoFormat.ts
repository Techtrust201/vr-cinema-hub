/**
 * Reconnaissance de l'encodage et du relief d'une vidéo à partir de ses images.
 *
 * Les fichiers livrés par les producteurs de contenu ne déclarent presque jamais ces
 * informations : ni boîte `sv3d`, ni boîte `st3d`, rien. Elles doivent donc être saisies à
 * la main, ce qui suppose que la personne qui envoie le fichier les connaisse — et une
 * erreur ne se voit qu'une fois le casque sur la tête. Ce module propose le réglage à
 * l'avance, à charge pour l'opérateur de le confirmer ou de le corriger.
 *
 * Deux mesures, choisies pour leurs marges :
 *
 * - **Ressemblance des moitiés.** En relief, les deux moitiés de l'image sont deux vues
 *   d'une même scène, séparées de quelques centimètres : elles sont donc presque
 *   identiques. Mesuré sur les vidéos de référence : écart de 2 à 4 en relief, contre 51 à
 *   93 sinon.
 *
 * - **Rupture à mi-hauteur.** La grille 3x2 d'un cubemap équi-angulaire porte en haut les
 *   faces gauche/avant/droite, en bas les faces bas/arrière/haut. Les deux rangées n'ont
 *   aucun rapport, d'où une rupture franche entre elles. Mesuré : de 8 à 41 pour un
 *   cubemap, contre 0,8 à 1,5 pour un équirectangulaire.
 *
 * On aurait pu croire à une rupture aux tiers de la largeur, là où se touchent les faces.
 * Il n'y en a pas : l'agencement retenu par YouTube juxtapose des faces adjacentes sur le
 * cube, si bien que le contenu y est continu. C'est précisément ce qui rend cet encodage
 * économe à la compression, et ce qui interdit de le repérer par ce biais.
 *
 * Validé sur seize images tirées de quatre vidéos couvrant les quatre cas de figure.
 */

export type SourceLayout = "equirectangular" | "equiangular_cubemap";
export type StereoMode = "mono" | "top_bottom" | "side_by_side";

export type DetectedFormat = {
  sourceLayout: SourceLayout;
  stereoMode: StereoMode;
  /** Vrai si les images examinées ont donné un verdict franc et unanime. */
  confident: boolean;
  /** Formulation destinée à l'opérateur, pour qu'il puisse juger la proposition. */
  explanation: string;
};

/**
 * En relief, l'écart entre les deux moitiés reste sous 6 ; sans relief il dépasse 27.
 * Le seuil est placé dans un vide de mesure d'un facteur quatre.
 */
const STEREO_SIMILARITY_MAX = 6;

/**
 * Un cubemap donne au moins 8, un équirectangulaire au plus 1,5. Même remarque : le seuil
 * est loin de toute mesure observée, dans un rapport supérieur à trois de chaque côté.
 */
const CUBEMAP_DISCONTINUITY_MIN = 2.5;

/**
 * En deçà, l'image est trop uniforme pour rien mesurer : générique, fondu, plan noir.
 *
 * Mesuré comme l'écart-type de la luminance, et non comme l'écart entre pixels voisins :
 * un ciel dégradé est parfaitement exploitable tout en étant lisse au point que ses pixels
 * voisins ne diffèrent presque pas. Relevé sur les vidéos de référence : de 42 à 78. Un
 * plan noir ou un fondu reste sous 3.
 */
const MIN_CONTRAST = 8;

/**
 * Largeur d'analyse. La hauteur, elle, est conservée telle quelle : la rupture se mesure
 * entre deux lignes voisines, et réduire verticalement les moyennerait, donc l'effacerait.
 * Mesuré sur la vidéo de référence : rupture de 40,9 en pleine résolution, 42,2 en ne
 * réduisant que la largeur, mais 17,2 en réduisant les deux côtés d'un facteur quatre.
 * Réduire en largeur moyenne le long des lignes, ce qui ne peut qu'assainir la mesure.
 */
const MAX_ANALYSIS_WIDTH = 960;

const THUMB_SIZE = 96;

type FrameMetrics = {
  topBottomSimilarity: number;
  sideBySideSimilarity: number;
  midHeightDiscontinuity: number;
  contrast: number;
};

/** Luminance d'une image RGBA, en une seule passe. */
function toLuma(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return luma;
}

/** Réduit une région à une imagette carrée, par moyenne de blocs. */
function shrink(
  luma: Float32Array,
  width: number,
  x0: number,
  y0: number,
  regionWidth: number,
  regionHeight: number,
): Float32Array {
  const out = new Float32Array(THUMB_SIZE * THUMB_SIZE);
  const stepX = regionWidth / THUMB_SIZE;
  const stepY = regionHeight / THUMB_SIZE;

  for (let ty = 0; ty < THUMB_SIZE; ty++) {
    const srcY0 = y0 + Math.floor(ty * stepY);
    const srcY1 = Math.max(srcY0 + 1, y0 + Math.floor((ty + 1) * stepY));
    for (let tx = 0; tx < THUMB_SIZE; tx++) {
      const srcX0 = x0 + Math.floor(tx * stepX);
      const srcX1 = Math.max(srcX0 + 1, x0 + Math.floor((tx + 1) * stepX));
      let sum = 0;
      let count = 0;
      for (let y = srcY0; y < srcY1; y++) {
        const row = y * width;
        for (let x = srcX0; x < srcX1; x++) {
          sum += luma[row + x];
          count++;
        }
      }
      out[ty * THUMB_SIZE + tx] = sum / count;
    }
  }
  return out;
}

function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Écart moyen entre deux lignes voisines. */
function rowGap(luma: Float32Array, width: number, y: number): number {
  const a = y * width;
  const b = (y - 1) * width;
  let sum = 0;
  for (let x = 0; x < width; x++) sum += Math.abs(luma[a + x] - luma[b + x]);
  return sum / width;
}

function measure(luma: Float32Array, width: number, height: number): FrameMetrics {
  const halfH = Math.floor(height / 2);
  const halfW = Math.floor(width / 2);

  const topBottomSimilarity = meanAbsDiff(
    shrink(luma, width, 0, 0, width, halfH),
    shrink(luma, width, 0, halfH, width, halfH),
  );
  const sideBySideSimilarity = meanAbsDiff(
    shrink(luma, width, 0, 0, halfW, height),
    shrink(luma, width, halfW, 0, halfW, height),
  );

  // La rupture est rapportée à celle de son voisinage : une image chargée en détails
  // présente partout de forts écarts entre lignes, ce qui rendrait une mesure absolue
  // inexploitable.
  const neighbours: number[] = [];
  for (let dy = -40; dy <= 40; dy++) {
    const y = halfH + dy;
    if (Math.abs(dy) <= 3 || y < 1 || y >= height) continue;
    neighbours.push(rowGap(luma, width, y));
  }
  neighbours.sort((a, b) => a - b);
  const baseline = neighbours.length > 0 ? neighbours[Math.floor(neighbours.length / 2)] : 0;
  const midHeightDiscontinuity = rowGap(luma, width, halfH) / (baseline + 1e-6);

  // Écart-type sur une grille clairsemée : suffit à écarter les images unies, pour un coût
  // négligeable.
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 0; y < height; y += 8) {
    const row = y * width;
    for (let x = 0; x < width; x += 8) {
      const v = luma[row + x];
      sum += v;
      sumSquares += v * v;
      count++;
    }
  }
  const mean = count > 0 ? sum / count : 0;
  const variance = count > 0 ? Math.max(0, sumSquares / count - mean * mean) : 0;

  return {
    topBottomSimilarity,
    sideBySideSimilarity,
    midHeightDiscontinuity,
    contrast: Math.sqrt(variance),
  };
}

type FrameVerdict = {
  sourceLayout: SourceLayout;
  stereoMode: StereoMode;
};

function classify(m: FrameMetrics): FrameVerdict | null {
  if (m.contrast < MIN_CONTRAST) return null;

  // Le relief est examiné d'abord : une stéréo haut/bas produit elle aussi une rupture à
  // mi-hauteur, et la confondre avec un cubemap déformerait toute l'image.
  if (m.topBottomSimilarity < STEREO_SIMILARITY_MAX) {
    return { sourceLayout: "equirectangular", stereoMode: "top_bottom" };
  }
  if (m.sideBySideSimilarity < STEREO_SIMILARITY_MAX) {
    return { sourceLayout: "equirectangular", stereoMode: "side_by_side" };
  }
  if (m.midHeightDiscontinuity > CUBEMAP_DISCONTINUITY_MIN) {
    return { sourceLayout: "equiangular_cubemap", stereoMode: "mono" };
  }
  return { sourceLayout: "equirectangular", stereoMode: "mono" };
}

/** Décision exportée pour les tests, sans dépendance au navigateur. */
export function classifyFrameMetrics(m: FrameMetrics): FrameVerdict | null {
  return classify(m);
}

export function measureFrame(
  luma: Float32Array,
  width: number,
  height: number,
): FrameMetrics {
  return measure(luma, width, height);
}

function describe(v: FrameVerdict, usable: number, total: number, unanimous: boolean): string {
  const encodage =
    v.sourceLayout === "equiangular_cubemap"
      ? "cubemap équi-angulaire (encodage YouTube)"
      : "équirectangulaire";
  const relief =
    v.stereoMode === "top_bottom"
      ? "relief haut/bas"
      : v.stereoMode === "side_by_side"
        ? "relief côte à côte"
        : "sans relief";

  if (!unanimous) {
    return `Analyse hésitante sur ${usable} image(s) : ${encodage}, ${relief}. ` +
      "À vérifier avant d'enregistrer.";
  }
  if (usable < 2) {
    return `Une seule image exploitable sur ${total} : ${encodage}, ${relief}. ` +
      "À vérifier avant d'enregistrer.";
  }
  return `Reconnu sur ${usable} images : ${encodage}, ${relief}.`;
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      clearTimeout(timer);
      resolve(ok);
    };
    const onSeeked = () => done(true);
    const onError = () => done(false);
    // Un positionnement peut ne jamais aboutir sur un fichier abîmé : sans garde-fou,
    // l'envoi resterait bloqué sans explication.
    const timer = setTimeout(() => done(false), 5000);

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

/**
 * Examine quelques images réparties dans la vidéo et propose un encodage et un relief.
 *
 * Le verdict est celui de la majorité des images exploitables, et n'est annoncé comme sûr
 * que si elles sont unanimes : le doute doit remonter à l'opérateur plutôt que d'être
 * masqué.
 */
export async function detectVideoFormat(file: File): Promise<DetectedFormat> {
  const fallback: DetectedFormat = {
    sourceLayout: "equirectangular",
    stereoMode: "mono",
    confident: false,
    // Cas le plus courant : une vidéo HEVC, que les navigateurs de bureau ne décodent pas
    // tous, alors que le Quest la lit sans peine par son décodeur matériel. Le message dit
    // donc ce qui manque et ce qui n'est pas en cause, pour ne pas laisser croire que la
    // vidéo est inutilisable.
    explanation:
      "Ce navigateur ne sait pas décoder ce fichier, souvent le cas des vidéos HEVC. " +
      "Les réglages sont à renseigner à la main et la miniature sera absente, mais la " +
      "lecture dans le casque n'est pas concernée.",
  };

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  try {
    const ready = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 15000);
      video.addEventListener("loadeddata", () => {
        clearTimeout(timer);
        resolve(true);
      }, { once: true });
      video.addEventListener("error", () => {
        clearTimeout(timer);
        resolve(false);
      }, { once: true });
      video.src = url;
    });

    if (!ready || !video.videoWidth || !video.videoHeight) return fallback;

    const width = Math.max(64, Math.min(video.videoWidth, MAX_ANALYSIS_WIDTH));
    const height = video.videoHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallback;

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    // Réparties dans la durée, en évitant début et fin où l'on tombe sur un générique ou
    // un fondu au noir.
    const times = duration > 0
      ? [0.2, 0.4, 0.6, 0.8].map((f) => f * duration)
      : [0];

    const verdicts: FrameVerdict[] = [];
    for (const t of times) {
      if (duration > 0 && !(await seekTo(video, t))) continue;
      ctx.drawImage(video, 0, 0, width, height);
      let luma: Float32Array;
      try {
        const { data } = ctx.getImageData(0, 0, width, height);
        luma = toLuma(data, width, height);
      } catch {
        // Canvas rendu inutilisable par une restriction d'origine : rien à mesurer.
        return fallback;
      }
      const verdict = classify(measure(luma, width, height));
      if (verdict) verdicts.push(verdict);
    }

    if (verdicts.length === 0) {
      return {
        ...fallback,
        explanation:
          "Aucune image exploitable : la vidéo est trop uniforme pour être analysée. " +
          "Les réglages sont à vérifier à la main.",
      };
    }

    const key = (v: FrameVerdict) => `${v.sourceLayout}|${v.stereoMode}`;
    const tally = new Map<string, { verdict: FrameVerdict; count: number }>();
    for (const v of verdicts) {
      const k = key(v);
      const entry = tally.get(k);
      if (entry) entry.count++;
      else tally.set(k, { verdict: v, count: 1 });
    }
    const winner = [...tally.values()].sort((a, b) => b.count - a.count)[0];
    const unanimous = tally.size === 1;

    return {
      sourceLayout: winner.verdict.sourceLayout,
      stereoMode: winner.verdict.stereoMode,
      confident: unanimous && verdicts.length >= 2,
      explanation: describe(winner.verdict, verdicts.length, times.length, unanimous),
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
