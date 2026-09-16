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
}

// Identifiants de codec tels qu'ils apparaissent dans la table `stsd` d'un MP4.
const CODECS: Record<string, { label: string; verdict: VideoVerdict }> = {
  avc1: { label: "H.264", verdict: "ok" },
  avc3: { label: "H.264", verdict: "ok" },
  hvc1: { label: "HEVC (H.265)", verdict: "risky" },
  hev1: { label: "HEVC (H.265)", verdict: "risky" },
  vp08: { label: "VP8", verdict: "unsupported" },
  vp09: { label: "VP9", verdict: "unsupported" },
  av01: { label: "AV1", verdict: "unsupported" },
  mp4v: { label: "MPEG-4 Part 2", verdict: "unsupported" },
};

// Au-delà, le décodeur matériel du Quest 3 décroche sur du H.264.
const MAX_SAFE_WIDTH = 4096;
const MAX_SAFE_HEIGHT = 2304;

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

  if (container === "webm" || container === "mkv") {
    return {
      verdict: "unsupported",
      codecLabel: "conteneur " + container.toUpperCase(),
      container,
      width: null,
      height: null,
      message: `Le casque ne sait pas ouvrir les fichiers ${container.toUpperCase()}.`,
      advice: "Convertissez le fichier en MP4 (H.264) avant de l'envoyer.",
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
        message: `Ce film est en ${width} × ${height}, au-delà de ce que le casque décode de façon fiable.`,
        advice: "Réduisez-le en 4K (3840 × 2160) pour éviter les images noires ou saccadées.",
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
