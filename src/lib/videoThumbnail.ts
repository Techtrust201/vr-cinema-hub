/**
 * Génère la miniature d'une vidéo dans le navigateur, sans dépendance ni traitement serveur.
 *
 * Une image est extraite avec un élément <video> hors écran puis dessinée dans un canvas. Cela
 * fonctionne pour tout format que le navigateur sait décoder — donc les mêmes que ceux acceptés
 * à l'envoi. Un format exotique échoue proprement : la vidéo est alors enregistrée sans
 * miniature, et le casque affiche sa vignette de repli.
 *
 * Le cadrage dépend de la projection. Une vidéo 360 est stockée en équirectangulaire : la
 * réduire entièrement donne une image très déformée et illisible. On conserve donc la bande
 * centrale, qui correspond à l'horizon et concentre l'essentiel de la scène.
 */

export type ThumbnailProjection = "flat" | "180" | "360";

export interface ThumbnailResult {
  blob: Blob;
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
  projection: ThumbnailProjection,
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

    const source = computeSourceRect(frame.width, frame.height, projection);
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

    return { blob, width: TARGET_WIDTH, height: TARGET_HEIGHT };
  } catch {
    // Décodage impossible : on renonce silencieusement, l'appelant enregistre sans miniature.
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Zone de la vidéo à conserver. Pour une projection immersive, on garde une bande horizontale
 * centrée : au-delà de l'horizon, une équirectangulaire n'est plus interprétable une fois
 * réduite. Pour une vidéo plate, on remplit le cadre en recadrant le débord.
 */
export function computeSourceRect(
  width: number,
  height: number,
  projection: ThumbnailProjection,
) {
  const targetRatio = TARGET_WIDTH / TARGET_HEIGHT;

  if (projection === "flat") {
    const sourceRatio = width / height;
    if (sourceRatio > targetRatio) {
      const cropped = height * targetRatio;
      return { x: (width - cropped) / 2, y: 0, width: cropped, height };
    }
    const cropped = width / targetRatio;
    return { x: 0, y: (height - cropped) / 2, width, height: cropped };
  }

  // Projections immersives : on part de la largeur utile puis on prend la hauteur voulue autour
  // de l'équateur de l'image. Le 180 occupe déjà la totalité de la largeur du cadre source.
  const usableWidth = projection === "360" ? width * 0.55 : width;
  const bandHeight = Math.min(height, usableWidth / targetRatio);

  return {
    x: (width - usableWidth) / 2,
    y: (height - bandHeight) / 2,
    width: usableWidth,
    height: bandHeight,
  };
}

function captureFrame(
  video: HTMLVideoElement,
  objectUrl: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: { width: number; height: number } | null) => {
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
      finish({ width: video.videoWidth, height: video.videoHeight });
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
