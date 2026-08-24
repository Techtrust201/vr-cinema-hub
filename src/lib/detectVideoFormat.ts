/**
 * Reconnaissance du format d'une vidéo à partir de ses images.
 *
 * Les fichiers livrés par les producteurs de contenu ne déclarent presque jamais leur
 * format : ni boîte `sv3d`, ni boîte `st3d`, rien. Il faudrait donc que la personne qui
 * envoie le fichier connaisse sa géométrie, son relief et son encodage — et une erreur ne
 * se voit qu'une fois le casque sur la tête. Ce module propose les trois réglages, à charge
 * pour l'opérateur de les confirmer ou de les corriger.
 *
 * La reconnaissance se fait en deux temps. On identifie d'abord le relief, qui dit quelle
 * portion de l'image constitue un point de vue ; puis on caractérise ce seul point de vue.
 * Cet ordre importe : mesurer sur l'image entière ferait passer la frontière entre les deux
 * yeux pour une propriété du contenu.
 *
 * Quatre mesures, toutes choisies pour l'ampleur de leurs marges. Les valeurs citées ont
 * été relevées sur quatre vidéos réelles couvrant les quatre cas de figure, puis reproduites
 * par une transcription indépendante en Python.
 */

export type SourceLayout = "equirectangular" | "equiangular_cubemap";
export type StereoMode = "mono" | "top_bottom" | "side_by_side";
export type Projection = "360" | "180" | "flat";

export type DetectedFormat = {
  projection: Projection;
  stereoMode: StereoMode;
  sourceLayout: SourceLayout;
  /** Vrai si les images examinées ont donné un verdict franc et unanime. */
  confident: boolean;
  /** Formulation destinée à l'opérateur, pour qu'il puisse juger la proposition. */
  explanation: string;
};

/**
 * **Relief.** Les deux moitiés de l'image sont alors deux vues d'une même scène, prises à
 * quelques centimètres d'écart : elles sont donc presque identiques. Relevé : écart de 2 à 4
 * en relief, contre 27 à 94 sinon. Le seuil tombe dans un vide de mesure d'un facteur quatre.
 */
const STEREO_SIMILARITY_MAX = 6;

/**
 * **Encodage en cubemap.** La grille 3x2 porte en haut les faces gauche/avant/droite, en bas
 * les faces bas/arrière/haut. Les deux rangées n'ont aucun rapport, d'où une rupture franche
 * entre elles. Relevé : de 43 à 154 pour un cubemap, contre 0,8 à 1,5 pour une
 * équirectangulaire.
 *
 * On chercherait en vain une rupture aux tiers de la largeur, là où se touchent les faces :
 * cet agencement juxtapose des faces adjacentes sur le cube, si bien que le contenu y est
 * continu. C'est ce qui rend l'encodage économe à la compression, et ce qui interdit de le
 * repérer par ce biais.
 */
const CUBEMAP_ROW_SPLIT_MIN = 2.5;

/**
 * **Couverture de 360 degrés.** L'image fait alors le tour complet : son bord gauche
 * prolonge son bord droit, puisque tous deux regardent dans la même direction. Relevé : de
 * 0,8 à 1,5 pour une 360, contre 4,3 à 24 pour une 180 et 4,9 à 12 pour une image plate.
 */
const WRAP_MAX = 2.5;

/**
 * **Couverture sphérique en hauteur.** La ligne du haut représente alors le zénith, une
 * direction unique : elle est donc quasi constante par construction. C'est une propriété
 * géométrique, non une hypothèse sur le contenu. Relevé : de 0,02 à 0,09 pour une image
 * sphérique, contre 0,7 à 5,2 pour une image plate.
 */
const POLE_UNIFORMITY_MAX = 0.15;

/**
 * En deçà, l'image est trop uniforme pour rien mesurer : générique, fondu, plan noir.
 *
 * Mesuré comme l'écart-type de la luminance, et non comme l'écart entre pixels voisins : un
 * ciel dégradé est parfaitement exploitable tout en étant lisse au point que ses pixels
 * voisins ne diffèrent presque pas. Relevé : de 42 à 78. Un plan noir reste sous 3.
 */
const MIN_CONTRAST = 8;

/**
 * Largeur d'analyse. La hauteur, elle, est conservée telle quelle : les ruptures se mesurent
 * entre deux lignes voisines, et réduire verticalement les moyennerait, donc les effacerait.
 * Mesuré : rupture de 40,9 en pleine résolution, 42,2 en ne réduisant que la largeur, mais
 * 17,2 en réduisant les deux côtés d'un facteur quatre. Réduire en largeur moyenne le long
 * des lignes, ce qui ne peut qu'assainir la mesure.
 */
const MAX_ANALYSIS_WIDTH = 960;

const THUMB_SIZE = 96;

/** Nombre d'images examinées, réparties dans la durée. */
const SAMPLE_FRACTIONS = [0.2, 0.4, 0.6, 0.8];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Grandeurs mesurées sur l'image entière, qui renseignent sur le relief. */
export interface StereoMetrics {
  topBottomSimilarity: number;
  sideBySideSimilarity: number;
  contrast: number;
}

/** Grandeurs mesurées sur un seul point de vue, qui renseignent sur son format. */
export interface EyeMetrics {
  rowSplit: number;
  wrap: number;
  poleUniformity: number;
}

export interface FrameVerdict {
  projection: Projection;
  stereoMode: StereoMode;
  sourceLayout: SourceLayout;
}

/** Luminance d'une image RGBA, en une seule passe. */
function toLuma(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return luma;
}

/** Réduit une région à une imagette carrée, par moyenne de blocs. */
function shrink(luma: Float32Array, width: number, region: Rect): Float32Array {
  const out = new Float32Array(THUMB_SIZE * THUMB_SIZE);
  const stepX = region.width / THUMB_SIZE;
  const stepY = region.height / THUMB_SIZE;

  for (let ty = 0; ty < THUMB_SIZE; ty++) {
    const y0 = region.y + Math.floor(ty * stepY);
    const y1 = Math.max(y0 + 1, region.y + Math.floor((ty + 1) * stepY));
    for (let tx = 0; tx < THUMB_SIZE; tx++) {
      const x0 = region.x + Math.floor(tx * stepX);
      const x1 = Math.max(x0 + 1, region.x + Math.floor((tx + 1) * stepX));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
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

/** Écart moyen entre deux lignes voisines, sur la largeur d'une région. */
function rowGap(luma: Float32Array, width: number, region: Rect, y: number): number {
  const a = y * width;
  const b = (y - 1) * width;
  let sum = 0;
  for (let x = region.x; x < region.x + region.width; x++) {
    sum += Math.abs(luma[a + x] - luma[b + x]);
  }
  return sum / region.width;
}

/** Écart moyen entre deux colonnes, sur la hauteur d'une région. */
function columnGap(luma: Float32Array, width: number, region: Rect, xa: number, xb: number): number {
  let sum = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    const row = y * width;
    sum += Math.abs(luma[row + xa] - luma[row + xb]);
  }
  return sum / region.height;
}

/** Variation horizontale moyenne d'une ligne. */
function rowVariation(luma: Float32Array, width: number, region: Rect, y: number): number {
  const row = y * width;
  let sum = 0;
  for (let x = region.x + 1; x < region.x + region.width; x++) {
    sum += Math.abs(luma[row + x] - luma[row + x - 1]);
  }
  return sum / Math.max(1, region.width - 1);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Portion de l'image occupée par un seul point de vue. */
export function eyeRect(width: number, height: number, stereo: StereoMode): Rect {
  switch (stereo) {
    case "top_bottom":
      return { x: 0, y: 0, width, height: Math.floor(height / 2) };
    case "side_by_side":
      return { x: 0, y: 0, width: Math.floor(width / 2), height };
    default:
      return { x: 0, y: 0, width, height };
  }
}

export function measureStereo(
  luma: Float32Array,
  width: number,
  height: number,
): StereoMetrics {
  const halfH = Math.floor(height / 2);
  const halfW = Math.floor(width / 2);

  const topBottomSimilarity = meanAbsDiff(
    shrink(luma, width, { x: 0, y: 0, width, height: halfH }),
    shrink(luma, width, { x: 0, y: halfH, width, height: halfH }),
  );
  const sideBySideSimilarity = meanAbsDiff(
    shrink(luma, width, { x: 0, y: 0, width: halfW, height }),
    shrink(luma, width, { x: halfW, y: 0, width: halfW, height }),
  );

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

  return { topBottomSimilarity, sideBySideSimilarity, contrast: Math.sqrt(variance) };
}

export function measureEye(
  luma: Float32Array,
  width: number,
  eye: Rect,
): EyeMetrics {
  // Chaque rupture est rapportée à celle de son voisinage : une image chargée en détails
  // présente partout de forts écarts, ce qui rendrait une mesure absolue inexploitable.
  const mid = eye.y + Math.floor(eye.height / 2);
  const neighbours: number[] = [];
  for (let dy = -40; dy <= 40; dy++) {
    const y = mid + dy;
    if (Math.abs(dy) <= 3 || y <= eye.y || y >= eye.y + eye.height) continue;
    neighbours.push(rowGap(luma, width, eye, y));
  }
  const rowSplit = rowGap(luma, width, eye, mid) / (median(neighbours) + 1e-6);

  const left = eye.x;
  const right = eye.x + eye.width - 1;
  const columnNeighbours: number[] = [];
  for (let d = 1; d < Math.min(60, Math.floor(eye.width / 2)); d++) {
    columnNeighbours.push(columnGap(luma, width, eye, left + d, left + d - 1));
    columnNeighbours.push(columnGap(luma, width, eye, right - d + 1, right - d));
  }
  const wrap = columnGap(luma, width, eye, left, right) / (median(columnNeighbours) + 1e-6);

  const top = [0, 1, 2].map((j) => rowVariation(luma, width, eye, eye.y + j));
  const bottom = [0, 1, 2].map((j) => rowVariation(luma, width, eye, eye.y + eye.height - 1 - j));
  const bodyStep = Math.max(1, Math.floor(eye.height / 40));
  const body: number[] = [];
  for (let y = eye.y + Math.floor(eye.height / 4); y < eye.y + Math.floor((3 * eye.height) / 4); y += bodyStep) {
    body.push(rowVariation(luma, width, eye, y));
  }
  const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const bodyVariation = average(body) + 1e-6;
  const poleUniformity = Math.max(average(top), average(bottom)) / bodyVariation;

  return { rowSplit, wrap, poleUniformity };
}

/**
 * Conclut à partir des grandeurs mesurées. Séparé de la mesure pour que l'enchaînement des
 * décisions, qui porte tout le raisonnement, soit vérifiable sans image.
 */
export function classify(stereo: StereoMetrics, eye: EyeMetrics): FrameVerdict | null {
  if (stereo.contrast < MIN_CONTRAST) return null;

  const stereoMode: StereoMode =
    stereo.topBottomSimilarity < STEREO_SIMILARITY_MAX
      ? "top_bottom"
      : stereo.sideBySideSimilarity < STEREO_SIMILARITY_MAX
        ? "side_by_side"
        : "mono";

  // Un cubemap couvre la sphère entière par construction : sa géométrie ne se déduit pas de
  // ses bords, qui ne se referment pas puisque les faces gauche et droite du cube ne sont pas
  // voisines — la face arrière se trouve entre elles.
  if (eye.rowSplit > CUBEMAP_ROW_SPLIT_MIN) {
    return { projection: "360", stereoMode, sourceLayout: "equiangular_cubemap" };
  }

  const projection: Projection =
    eye.wrap < WRAP_MAX
      ? "360"
      : eye.poleUniformity < POLE_UNIFORMITY_MAX
        ? "180"
        : "flat";

  // Le relief n'a pas de sens sur un écran : une image plate dont les deux moitiés se
  // ressemblent par hasard ne doit pas être coupée en deux.
  return {
    projection,
    stereoMode: projection === "flat" ? "mono" : stereoMode,
    sourceLayout: "equirectangular",
  };
}

/** Enchaîne mesure et décision sur une image. */
export function classifyFrame(
  luma: Float32Array,
  width: number,
  height: number,
): FrameVerdict | null {
  const stereo = measureStereo(luma, width, height);
  if (stereo.contrast < MIN_CONTRAST) return null;

  const stereoMode: StereoMode =
    stereo.topBottomSimilarity < STEREO_SIMILARITY_MAX
      ? "top_bottom"
      : stereo.sideBySideSimilarity < STEREO_SIMILARITY_MAX
        ? "side_by_side"
        : "mono";

  return classify(stereo, measureEye(luma, width, eyeRect(width, height, stereoMode)));
}

const PROJECTION_WORDS: Record<Projection, string> = {
  "360": "vidéo à 360 degrés",
  "180": "vidéo à 180 degrés",
  flat: "vidéo plate, comme au cinéma",
};

const STEREO_WORDS: Record<StereoMode, string> = {
  mono: "sans relief",
  top_bottom: "en relief, les deux yeux superposés",
  side_by_side: "en relief, les deux yeux côte à côte",
};

const LAYOUT_WORDS: Record<SourceLayout, string> = {
  equirectangular: "encodage courant",
  equiangular_cubemap: "encodage en faces de cube, celui de YouTube",
};

export function describeFormat(v: FrameVerdict): string {
  return `${PROJECTION_WORDS[v.projection]}, ${STEREO_WORDS[v.stereoMode]}, ${LAYOUT_WORDS[v.sourceLayout]}`;
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
 * Examine quelques images réparties dans la vidéo et propose son format.
 *
 * Le verdict est celui de la majorité des images exploitables, et n'est annoncé comme sûr
 * que si elles sont unanimes : le doute doit remonter à l'opérateur plutôt que d'être masqué.
 */
export async function detectVideoFormat(file: File): Promise<DetectedFormat> {
  const fallback: DetectedFormat = {
    projection: "360",
    stereoMode: "mono",
    sourceLayout: "equirectangular",
    confident: false,
    // Cas le plus courant : une vidéo HEVC, que les navigateurs de bureau ne décodent pas
    // tous, alors que le Quest la lit sans peine par son décodeur matériel. Le message dit
    // donc ce qui manque et ce qui n'est pas en cause, pour ne pas laisser croire que la
    // vidéo est inutilisable.
    explanation:
      "Ce navigateur ne sait pas lire ce fichier, ce qui arrive souvent avec les vidéos " +
      "HEVC. Les réglages sont donc à vérifier à la main et la vignette sera absente, " +
      "mais la lecture dans le casque n'est pas concernée.",
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
    // Réparties dans la durée, en évitant début et fin où l'on tombe sur un générique ou un
    // fondu au noir.
    const times = duration > 0 ? SAMPLE_FRACTIONS.map((f) => f * duration) : [0];

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
      const verdict = classifyFrame(luma, width, height);
      if (verdict) verdicts.push(verdict);
    }

    if (verdicts.length === 0) {
      return {
        ...fallback,
        explanation:
          "Les images de cette vidéo sont trop uniformes pour être reconnues. " +
          "Les réglages sont à vérifier à la main.",
      };
    }

    const tally = new Map<string, { verdict: FrameVerdict; count: number }>();
    for (const v of verdicts) {
      const key = `${v.projection}|${v.stereoMode}|${v.sourceLayout}`;
      const entry = tally.get(key);
      if (entry) entry.count++;
      else tally.set(key, { verdict: v, count: 1 });
    }
    const winner = [...tally.values()].sort((a, b) => b.count - a.count)[0];
    const unanimous = tally.size === 1;
    const confident = unanimous && verdicts.length >= 2;
    const description = describeFormat(winner.verdict);

    return {
      ...winner.verdict,
      confident,
      explanation: confident
        ? `Reconnu sur ${verdicts.length} images : ${description}.`
        : `${description}. Les images examinées ne concordent pas toutes : à vérifier avant d'enregistrer.`,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
