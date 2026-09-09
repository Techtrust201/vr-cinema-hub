/**
 * Génère la miniature d'une vidéo dans le navigateur, sans dépendance ni traitement serveur.
 *
 * Une image est extraite avec un élément <video> hors écran puis dessinée dans un canvas. Cela
 * fonctionne pour tout format que le navigateur sait décoder — donc les mêmes que ceux acceptés
 * à l'envoi. Un format exotique échoue proprement : la vidéo est alors enregistrée sans
 * miniature, et le casque affiche sa vignette de repli.
 *
 * Le cadrage dépend du format, et en trois temps.
 *
 * D'abord le relief : une vidéo stéréo empile deux points de vue dans la même image. Cadrer
 * sans en tenir compte donne une miniature à cheval sur les deux, c'est-à-dire le bas d'un œil
 * surmonté du haut de l'autre.
 *
 * Ensuite l'encodage. Une source équirectangulaire réduite en entier est illisible, tant elle
 * est étirée aux pôles : on garde la bande centrale, qui correspond à l'horizon et concentre
 * l'essentiel de la scène. Une source en cubemap, elle, n'est pas une image continue mais une
 * grille de six faces : on isole la face avant, qui est précisément la vue vers l'avant.
 *
 * Enfin la géométrie, qui décide de la largeur utile pour une source équirectangulaire.
 */

export type ThumbnailProjection = "flat" | "180" | "360";
export type ThumbnailStereo = "mono" | "top_bottom" | "side_by_side";
export type ThumbnailSourceLayout = "equirectangular" | "equiangular_cubemap";

export interface ThumbnailFormat {
  projection: ThumbnailProjection;
  stereo: ThumbnailStereo;
  sourceLayout: ThumbnailSourceLayout;
}

export interface ThumbnailResult {
  blob: Blob;
  width: number;
  height: number;
  durationSeconds: number | null;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TARGET_WIDTH = 640;
const TARGET_HEIGHT = 360; // 16:9, format des vignettes de la bibliothèque
const JPEG_QUALITY = 0.82;

// Les premières images sont souvent noires ou dans un fondu d'ouverture : on se place un peu
// après le début, tout en restant dans les premières secondes pour ne pas attendre.
const SEEK_RATIO = 0.08;
const SEEK_MAX_SECONDS = 12;
const TIMEOUT_MS = 20000;

/**
 * Extrait une miniature JPEG. Retourne null si le navigateur ne parvient pas à décoder la
 * vidéo : l'échec n'est jamais bloquant pour l'envoi.
 */
export async function generateVideoThumbnail(
  file: File,
  format: ThumbnailFormat,
): Promise<ThumbnailResult | null> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");

  try {
    const frame = await captureFrame(video, objectUrl);
    if (!frame) return null;

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.fillStyle = "#0f1319";
    context.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

    const source = computeSourceRect(frame.width, frame.height, format);
    context.drawImage(
      video,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      TARGET_WIDTH,
      TARGET_HEIGHT,
    );

    const blob = await canvasToBlob(canvas);
    if (!blob) return null;

    return { blob, width: TARGET_WIDTH, height: TARGET_HEIGHT, durationSeconds: frame.durationSeconds };
  } catch {
    // Décodage impossible : on renonce silencieusement, l'appelant enregistre sans miniature.
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT;

/**
 * Portion de l'image occupée par un seul point de vue.
 *
 * En relief, l'image livrée contient les deux yeux empilés. Un cadrage qui l'ignore tombe à
 * cheval sur leur frontière et donne une miniature coupée en deux.
 */
function singleEyeRect(width: number, height: number, stereo: ThumbnailStereo): Rect {
  switch (stereo) {
    case "top_bottom":
      return { x: 0, y: 0, width, height: height / 2 };
    case "side_by_side":
      return { x: 0, y: 0, width: width / 2, height };
    default:
      return { x: 0, y: 0, width, height };
  }
}

/**
 * Face avant d'un cubemap équi-angulaire : la case centrale de la rangée du haut.
 *
 * La grille 3x2 porte en haut gauche/avant/droite, en bas bas/arrière/haut. La face avant est
 * donc exactement la vue vers l'avant, ce qui en fait la meilleure miniature possible — plus
 * lisible encore que la bande d'horizon d'une équirectangulaire, qui couvre 360 degrés.
 */
function cubemapFrontFace(atlas: Rect): Rect {
  const faceWidth = atlas.width / 3;
  const faceHeight = atlas.height / 2;

  // Chaque face porte deux pixels de remplissage sur ses bords, destinés au filtrage. Les
  // écarter évite de laisser paraître un liseré du voisin.
  const padX = (2 / 3840) * atlas.width;
  const padY = (2 / 2160) * atlas.height;

  const innerWidth = faceWidth - 2 * padX;
  const innerHeight = faceHeight - 2 * padY;

  // La face est presque carrée, la miniature est en 16:9 : on prélève une bande centrée.
  const bandHeight = Math.min(innerHeight, innerWidth / TARGET_RATIO);

  return {
    x: atlas.x + faceWidth + padX,
    y: atlas.y + padY + (innerHeight - bandHeight) / 2,
    width: innerWidth,
    height: bandHeight,
  };
}

/** Bande d'horizon d'une source équirectangulaire. */
function equirectBand(atlas: Rect, projection: ThumbnailProjection): Rect {
  // Une 360 fait le tour complet : n'en garder qu'une part donne une vue à peu près naturelle.
  // Une 180 tient déjà dans la largeur du cadre.
  const usableWidth = projection === "360" ? atlas.width * 0.55 : atlas.width;
  const bandHeight = Math.min(atlas.height, usableWidth / TARGET_RATIO);

  return {
    x: atlas.x + (atlas.width - usableWidth) / 2,
    y: atlas.y + (atlas.height - bandHeight) / 2,
    width: usableWidth,
    height: bandHeight,
  };
}

/** Remplissage du cadre par recadrage du débord, pour une image plate. */
function coverCrop(atlas: Rect): Rect {
  if (atlas.width / atlas.height > TARGET_RATIO) {
    const cropped = atlas.height * TARGET_RATIO;
    return { x: atlas.x + (atlas.width - cropped) / 2, y: atlas.y, width: cropped, height: atlas.height };
  }
  const cropped = atlas.width / TARGET_RATIO;
  return { x: atlas.x, y: atlas.y + (atlas.height - cropped) / 2, width: atlas.width, height: cropped };
}

/**
 * Zone de la vidéo à conserver pour la miniature : un seul œil, puis la portion la plus
 * parlante de cet œil compte tenu de son encodage et de sa géométrie.
 */
export function computeSourceRect(
  width: number,
  height: number,
  format: ThumbnailFormat,
): Rect {
  // Une image plate n'a ni relief ni encodage sphérique : la traiter autrement recadrerait la
  // moitié d'une vidéo dont les deux moitiés se ressemblent par hasard.
  if (format.projection === "flat") {
    return coverCrop({ x: 0, y: 0, width, height });
  }

  const atlas = singleEyeRect(width, height, format.stereo);

  return format.sourceLayout === "equiangular_cubemap"
    ? cubemapFrontFace(atlas)
    : equirectBand(atlas, format.projection);
}

function captureFrame(
  video: HTMLVideoElement,
  objectUrl: string,
): Promise<{ width: number; height: number; durationSeconds: number | null } | null> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: { width: number; height: number; durationSeconds: number | null } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };

    // Un fichier corrompu peut laisser la vidéo sans jamais émettre d'événement : la limite de
    // temps garantit que l'envoi n'est pas suspendu indéfiniment.
    const timeout = window.setTimeout(() => finish(null), TIMEOUT_MS);

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    // Nécessaire pour que le canvas reste exploitable : sans cela, dessiner la vidéo le rendrait
    // inutilisable en lecture.
    video.crossOrigin = "anonymous";

    const finishWithFrame = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        finish(null);
        return;
      }
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      finish({ width: video.videoWidth, height: video.videoHeight, durationSeconds: duration });
    };

    let seeking = false;

    video.addEventListener("error", () => finish(null));

    video.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = Math.min(duration * SEEK_RATIO, SEEK_MAX_SECONDS);
      // Se placer là où la lecture se trouve déjà n'émet aucun « seeked ». Sans durée
      // exploitable, on garde donc la première image décodée plutôt que d'attendre un
      // événement qui ne viendra jamais et de laisser expirer le délai.
      if (target <= 0) return;
      seeking = true;
      video.currentTime = target;
    });

    video.addEventListener("loadeddata", () => {
      if (!seeking) finishWithFrame();
    });

    video.addEventListener("seeked", finishWithFrame);

    video.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", JPEG_QUALITY);
  });
}
