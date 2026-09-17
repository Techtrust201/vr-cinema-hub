// Identifie le codec d'un fichier vidéo avant de l'envoyer.
//
// Sans ce contrôle, un fichier VP9 ou AV1 part sur le stockage, se télécharge sur
// le casque, apparaît dans la bibliothèque… et donne un écran noir, sans le
// moindre message. C'est la panne la plus déroutante du système : tout semble
// avoir fonctionné.
//
// On lit uniquement les en-têtes : un fichier MP4 est un arbre de « boîtes »
// préfixées par leur taille, donc on saute de l'une à l'autre sans jamais
// charger le film en mémoire. Quelques kilo-octets suffisent, même pour 2 Go.

export type VideoVerdict = "ok" | "risky" | "unsupported" | "unknown";

export interface VideoProbe {
  verdict: VideoVerdict;
  /** Nom lisible du codec, par exemple « H.264 » ou « VP9 ». */
  codecLabel: string;
  container: string;
  width: number | null;
  height: number | null;
  /** Phrase destinée à l'exploitant, sans jargon. */
  message: string;
  /** Ce qu'il doit faire, quand il y a quelque chose à faire. */
  advice?: string;
  /**
   * Avertissement de netteté, renseigné une fois la projection connue. Séparé du
   * verdict : le film se lira sans défaut, il sera seulement moins net que ce que
   * le casque pourrait montrer.
   */
  sharpness?: { message: string; advice: string };
}

// Identifiants de codec tels qu'ils apparaissent dans la table `stsd` d'un MP4.
//
// Ces verdicts suivent les décodeurs que le Quest 3 déclare réellement (relevés
// dans /vendor/etc/media_codecs.xml) : H.264, HEVC, VP9 et AV1 y figurent, VP8
// et MPEG-4 Part 2 non. HEVC et VP9 étaient auparavant donnés pour douteux ou
// pour refusés ; la lecture a depuis été éprouvée sur casque, extraits à l'appui,
// et refuser un VP9 revenait à rejeter un fichier que l'appareil sait ouvrir.
const CODECS: Record<string, { label: string; verdict: VideoVerdict }> = {
  avc1: { label: "H.264", verdict: "ok" },
  avc3: { label: "H.264", verdict: "ok" },
  hvc1: { label: "HEVC (H.265)", verdict: "ok" },
  hev1: { label: "HEVC (H.265)", verdict: "ok" },
  vp09: { label: "VP9", verdict: "ok" },
  // Décodeur matériel présent, mais aucune lecture éprouvée sur casque : on
  // avertit sans retenir le fichier.
  av01: { label: "AV1", verdict: "risky" },
  vp08: { label: "VP8", verdict: "unsupported" },
  mp4v: { label: "MPEG-4 Part 2", verdict: "unsupported" },
};

// Ce que le décodeur matériel du Quest 3 annonce réellement : 8192 × 8192 en
// H.264 comme en HEVC. Un plafond de 4096 figurait ici, hérité du Quest 2 : il
// faisait conseiller de réduire en 4K une source 8K, donc de dégrader la seule
// chose qui rende une vidéo 360 nette. Les traces du casque au démarrage
// (« Décodeurs matériels ») donnent la valeur exacte de l'appareil en service.
const MAX_SAFE_WIDTH = 8192;
const MAX_SAFE_HEIGHT = 8192;

/**
 * Définition à partir de laquelle une vidéo panoramique est réellement nette.
 *
 * La netteté ressentie ne dépend pas de la définition du fichier mais du nombre
 * de pixels tombant dans un degré du champ de vision. L'écran du Quest 3 en
 * montre une vingtaine. Une image étalée sur 360° a donc besoin d'environ 7680
 * pixels de large pour les atteindre ; en 4K elle plafonne à 10,7, soit la
 * moitié, et paraît molle quoi que fasse l'application.
 *
 * Un film sur écran plat n'occupe qu'une cinquantaine de degrés : 4K y donne
 * déjà près de 70 pixels par degré, bien au-delà du nécessaire. C'est pourquoi
 * un même fichier 4K paraît superbe sur écran plat et flou en 360.
 */
const SHARP_360_WIDTH = 7680;
const SHARP_180_WIDTH = 3840;

/**
 * Prévient qu'une vidéo panoramique est trop peu définie pour être nette dans le
 * casque. Rend `null` quand il n'y a rien à signaler.
 *
 * Distinct du verdict de compatibilité : le film se lira parfaitement, il sera
 * simplement moins net que ce que le casque sait afficher. C'est une information
 * à donner avant l'envoi, quand il est encore temps de demander un meilleur
 * export, plutôt qu'une découverte faite casque sur la tête.
 */
export function sharpnessAdvice(
  width: number | null,
  projection: string | null | undefined,
): { message: string; advice: string } | null {
  if (!width || !projection) return null;

  // Le relief haut/bas partage les lignes entre les deux yeux : à définition
  // égale, chaque œil en reçoit la moitié.
  const needed = projection === "360" ? SHARP_360_WIDTH : projection === "180" ? SHARP_180_WIDTH : 0;
  if (needed === 0 || width >= needed) return null;

  const perDegree = projection === "360" ? width / 360 : width / 180;
  return {
    message:
      `Ce film sera lisible mais peu net : ${width} pixels étalés sur ${projection}° ` +
      `ne donnent que ${perDegree.toFixed(1)} pixels par degré, là où le casque en affiche 20.`,
    advice:
      `Pour une image nette, demandez un export en ${needed} pixels de large ` +
      `(${needed === 7680 ? "8K" : "4K"}) : le casque sait le lire.`,
  };
}

async function readChunk(file: Blob, start: number, length: number): Promise<DataView> {
  const end = Math.min(start + length, file.size);
  if (end <= start) return new DataView(new ArrayBuffer(0));
  return new DataView(await file.slice(start, end).arrayBuffer());
}

function fourCC(view: DataView, offset: number): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

interface Box {
  type: string;
  start: number; // début du contenu
  end: number; // fin de la boîte
}

/** Liste les boîtes d'un intervalle, sans descendre dedans. */
async function readBoxes(file: Blob, from: number, to: number, limit = 64): Promise<Box[]> {
  const boxes: Box[] = [];
  let offset = from;
  while (offset + 8 <= to && boxes.length < limit) {
    const header = await readChunk(file, offset, 16);
    if (header.byteLength < 8) break;

    let size = header.getUint32(0);
    const type = fourCC(header, 4);
    let contentStart = offset + 8;

    if (size === 1) {
      // Taille sur 64 bits : les fichiers de plus de 4 Go l'utilisent.
      if (header.byteLength < 16) break;
      const hi = header.getUint32(8);
      const lo = header.getUint32(12);
      size = hi * 2 ** 32 + lo;
      contentStart = offset + 16;
    } else if (size === 0) {
      size = to - offset; // la boîte court jusqu'à la fin
    }

    if (size < 8) break;
    boxes.push({ type, start: contentStart, end: offset + size });
    offset += size;
  }
  return boxes;
}

async function findBox(file: Blob, from: number, to: number, path: string[]): Promise<Box | null> {
  let scopeStart = from;
  let scopeEnd = to;
  let found: Box | null = null;

  for (const wanted of path) {
    const boxes = await readBoxes(file, scopeStart, scopeEnd);
    found = boxes.find((b) => b.type === wanted) ?? null;
    if (!found) return null;
    scopeStart = found.start;
    scopeEnd = found.end;
  }
  return found;
}

/**
 * Cherche la description d'échantillon de la piste vidéo. Un fichier contient
 * souvent plusieurs pistes (vidéo, audio, données) : on retient la première dont
 * le codec est reconnu comme visuel.
 */
async function findVideoSampleEntry(
  file: Blob,
  moov: Box,
): Promise<{ codec: string; width: number | null; height: number | null } | null> {
  const traks = (await readBoxes(file, moov.start, moov.end)).filter((b) => b.type === "trak");

  for (const trak of traks) {
    const stsd = await findBox(file, trak.start, trak.end, ["mdia", "minf", "stbl", "stsd"]);
    if (!stsd) continue;

    // stsd : 4 octets de version/flags, 4 octets de nombre d'entrées, puis les entrées.
    const entries = await readBoxes(file, stsd.start + 8, stsd.end, 8);
    for (const entry of entries) {
      const codec = entry.type.toLowerCase();
      if (!(codec in CODECS)) continue;

      // Une entrée visuelle porte largeur et hauteur à 24 et 26 octets du début.
      const v = await readChunk(file, entry.start, 32);
      const width = v.byteLength >= 28 ? v.getUint16(24) : null;
      const height = v.byteLength >= 30 ? v.getUint16(26) : null;
      return { codec, width, height };
    }
  }
  return null;
}

function containerOf(file: File): string {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : "";
}

/**
 * Analyse le fichier et rend un verdict exploitable tel quel dans l'interface.
 * Ne lève jamais : un fichier illisible rend le verdict « unknown », qui laisse
 * l'envoi se poursuivre plutôt que de bloquer sur un doute.
 */
export async function probeVideoFile(file: File): Promise<VideoProbe> {
  const container = containerOf(file);

  // WebM et MKV partagent une structure interne (Matroska) que l'analyse ci-dessous,
  // écrite pour les boîtes d'un MP4, ne sait pas parcourir : ni le codec ni la
  // définition ne peuvent en être tirés. Cela ne les rend pas illisibles pour autant.
  // Les deux ont été éprouvés sur casque, et étaient jusqu'ici refusés à tort.
  if (container === "webm" || container === "mkv") {
    return {
      verdict: "unknown",
      codecLabel: "indéterminé",
      container,
      width: null,
      height: null,
      message: `La définition d'un fichier ${container.toUpperCase()} ne peut pas être vérifiée avant l'envoi.`,
      advice: "L'envoi va se poursuivre. Vérifiez la lecture sur un casque avant de diffuser.",
    };
  }

  try {
    const top = await readBoxes(file, 0, file.size, 32);
    const moov = top.find((b) => b.type === "moov");
    if (!moov) {
      return {
        verdict: "unknown",
        codecLabel: "indéterminé",
        container,
        width: null,
        height: null,
        message: "Le format de ce fichier n'a pas pu être analysé.",
        advice: "L'envoi va se poursuivre, mais vérifiez la lecture sur un casque avant de le diffuser.",
      };
    }

    const track = await findVideoSampleEntry(file, moov);
    if (!track) {
      return {
        verdict: "unknown",
        codecLabel: "indéterminé",
        container,
        width: null,
        height: null,
        message: "Aucune piste vidéo reconnue dans ce fichier.",
        advice: "L'envoi va se poursuivre, mais vérifiez la lecture sur un casque avant de le diffuser.",
      };
    }

    const known = CODECS[track.codec];
    const { width, height } = track;
    const def = width && height ? ` (${width} × ${height})` : "";

    if (known.verdict === "unsupported") {
      return {
        verdict: "unsupported",
        codecLabel: known.label,
        container,
        width,
        height,
        message: `Ce film est encodé en ${known.label}${def}, que le casque ne sait pas afficher.`,
        advice: "Convertissez-le en H.264 avant de l'envoyer, sinon l'écran restera noir dans le casque.",
      };
    }

    if (known.verdict === "risky") {
      return {
        verdict: "risky",
        codecLabel: known.label,
        container,
        width,
        height,
        message: `Ce film est encodé en ${known.label}${def}, dont la lecture est irrégulière sur Quest 3.`,
        advice: "Le H.264 est plus sûr. Testez sur un casque avant de diffuser ce film à toute la flotte.",
      };
    }

    if ((width ?? 0) > MAX_SAFE_WIDTH || (height ?? 0) > MAX_SAFE_HEIGHT) {
      return {
        verdict: "risky",
        codecLabel: known.label,
        container,
        width,
        height,
        message: `Ce film est en ${width} × ${height}, au-delà des 8192 pixels que le casque sait décoder.`,
        advice: "Réduisez-le à 7680 pixels de large au maximum, sinon l'écran restera noir.",
      };
    }

    return {
      verdict: "ok",
      codecLabel: known.label,
      container,
      width,
      height,
      message: `Format compatible : ${known.label}${def}.`,
    };
  } catch {
    return {
      verdict: "unknown",
      codecLabel: "indéterminé",
      container,
      width: null,
      height: null,
      message: "Le format de ce fichier n'a pas pu être analysé.",
      advice: "L'envoi va se poursuivre, mais vérifiez la lecture sur un casque avant de le diffuser.",
    };
  }
}
