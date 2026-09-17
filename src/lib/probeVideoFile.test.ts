import { describe, expect, it } from "vitest";

import { probeVideoFile, sharpnessAdvice } from "./probeVideoFile";

// Construit de vrais fichiers MP4 en miniature. Un MP4 étant un arbre de boîtes
// « taille + type + contenu », quelques dizaines d'octets suffisent à reproduire
// fidèlement ce que le parseur rencontrera sur un film de 2 Go.

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(...payload);
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  return out;
}

/** Boîte à taille 64 bits, utilisée par les fichiers de plus de 4 Go. */
function largeBox(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(...payload);
  const out = new Uint8Array(16 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 1);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  view.setUint32(8, 0);
  view.setUint32(12, out.length);
  out.set(body, 16);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Entrée d'échantillon visuel : largeur et hauteur à 24 et 26 octets. */
function visualSampleEntry(codec: string, width: number, height: number): Uint8Array {
  const body = new Uint8Array(70);
  const view = new DataView(body.buffer);
  view.setUint16(24, width);
  view.setUint16(26, height);
  return box(codec, body);
}

function stsd(entry: Uint8Array): Uint8Array {
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(4, 1); // une seule entrée
  return box("stsd", header, entry);
}

function mp4(codec: string, width: number, height: number, opts: { moovLast?: boolean; large?: boolean } = {}) {
  const make = opts.large ? largeBox : box;
  const moov = make("moov", box("trak", box("mdia", box("minf", box("stbl", stsd(visualSampleEntry(codec, width, height)))))));
  const ftyp = box("ftyp", new Uint8Array(8));
  const mdat = box("mdat", new Uint8Array(4096));
  return concat(ftyp, ...(opts.moovLast ? [mdat, moov] : [moov, mdat]));
}

function asFile(bytes: Uint8Array, name = "film.mp4"): File {
  return new File([bytes as BlobPart], name, { type: "video/mp4" });
}

describe("probeVideoFile", () => {
  it("accepte du H.264 en 4K", async () => {
    const r = await probeVideoFile(asFile(mp4("avc1", 3840, 2160)));
    expect(r.verdict).toBe("ok");
    expect(r.codecLabel).toBe("H.264");
    expect(r.width).toBe(3840);
    expect(r.height).toBe(2160);
  });

  it("refuse le VP9, qui donnerait un écran noir", async () => {
    const r = await probeVideoFile(asFile(mp4("vp09", 3840, 2160)));
    expect(r.verdict).toBe("unsupported");
    expect(r.codecLabel).toBe("VP9");
    expect(r.advice).toMatch(/H\.264/);
  });

  it("refuse l'AV1", async () => {
    expect((await probeVideoFile(asFile(mp4("av01", 1920, 960)))).verdict).toBe("unsupported");
  });

  it("signale le HEVC comme risqué sans le bloquer", async () => {
    const r = await probeVideoFile(asFile(mp4("hvc1", 3840, 2160)));
    expect(r.verdict).toBe("risky");
    expect(r.codecLabel).toBe("HEVC (H.265)");
  });

  it("accepte une source 8K, que le décodeur du Quest 3 tient", async () => {
    // Ce cas était auparavant refusé au motif d'un plafond de 4096 hérité du
    // Quest 2 : l'exploitant était invité à réduire en 4K la seule définition
    // qui rende une vidéo 360 nette.
    const r = await probeVideoFile(asFile(mp4("avc1", 7680, 3840)));
    expect(r.verdict).toBe("ok");
    expect(r.width).toBe(7680);
  });

  it("alerte sur une définition que le casque ne tient pas", async () => {
    const r = await probeVideoFile(asFile(mp4("avc1", 8192, 8192)));
    expect(r.verdict).toBe("ok");
    const tropGrand = await probeVideoFile(asFile(mp4("avc1", 8192, 8194)));
    expect(tropGrand.verdict).toBe("risky");
    expect(tropGrand.message).toContain("8192");
  });

  it("trouve les informations même quand elles sont en fin de fichier", async () => {
    // Un fichier non optimisé pour la diffusion place `moov` après les données.
    const r = await probeVideoFile(asFile(mp4("avc1", 3840, 2160, { moovLast: true })));
    expect(r.verdict).toBe("ok");
    expect(r.width).toBe(3840);
  });

  it("gère les boîtes à taille 64 bits des fichiers volumineux", async () => {
    const r = await probeVideoFile(asFile(mp4("avc1", 3840, 2160, { large: true })));
    expect(r.verdict).toBe("ok");
  });

  it("rejette les conteneurs que le casque n'ouvre pas", async () => {
    const r = await probeVideoFile(asFile(new Uint8Array(64), "film.webm"));
    expect(r.verdict).toBe("unsupported");
    expect(r.message).toContain("WEBM");
  });

  it("laisse passer un fichier illisible plutôt que de bloquer sur un doute", async () => {
    const r = await probeVideoFile(asFile(new Uint8Array(32), "film.mp4"));
    expect(r.verdict).toBe("unknown");
    expect(r.advice).toBeDefined();
  });

  it("ne plante pas sur un fichier vide", async () => {
    const r = await probeVideoFile(asFile(new Uint8Array(0)));
    expect(r.verdict).toBe("unknown");
  });

  it("ignore une piste audio pour trouver la piste vidéo", async () => {
    const audio = box("trak", box("mdia", box("minf", box("stbl", stsd(box("mp4a", new Uint8Array(28)))))));
    const video = box("trak", box("mdia", box("minf", box("stbl", stsd(visualSampleEntry("avc1", 1920, 960))))));
    const file = asFile(concat(box("ftyp", new Uint8Array(8)), box("moov", audio, video)));
    const r = await probeVideoFile(file);
    expect(r.verdict).toBe("ok");
    expect(r.width).toBe(1920);
  });

  it("rend toujours un message lisible, sans jargon", async () => {
    for (const codec of ["avc1", "hvc1", "vp09", "av01", "mp4v"]) {
      const r = await probeVideoFile(asFile(mp4(codec, 3840, 2160)));
      expect(r.message.length).toBeGreaterThan(10);
      expect(r.message).not.toMatch(/_|stsd|moov|codec_/i);
    }
  });
});

describe("sharpnessAdvice", () => {
  it("prévient qu'une 360 en 4K sera peu nette", () => {
    const a = sharpnessAdvice(3840, "360");
    expect(a).not.toBeNull();
    // 3840 / 360 = 10,7 pixels par degré, contre une vingtaine affichés.
    expect(a!.message).toContain("10.7");
    expect(a!.advice).toContain("7680");
  });

  it("ne dit rien d'une 360 en 8K", () => {
    expect(sharpnessAdvice(7680, "360")).toBeNull();
  });

  it("ne dit rien d'un écran plat, où la 4K est déjà surabondante", () => {
    expect(sharpnessAdvice(1920, "flat")).toBeNull();
    expect(sharpnessAdvice(3840, "flat")).toBeNull();
  });

  it("attend moins d'une 180, qui étale ses pixels sur deux fois moins large", () => {
    expect(sharpnessAdvice(3840, "180")).toBeNull();
    expect(sharpnessAdvice(1920, "180")).not.toBeNull();
  });

  it("se taît quand la définition ou la projection est inconnue", () => {
    expect(sharpnessAdvice(null, "360")).toBeNull();
    expect(sharpnessAdvice(3840, null)).toBeNull();
    expect(sharpnessAdvice(3840, undefined)).toBeNull();
  });

  it("parle de netteté sans jargon technique", () => {
    const a = sharpnessAdvice(3840, "360")!;
    expect(a.message).not.toMatch(/equirect|codec|bitrate|foveat/i);
    expect(a.message).toMatch(/net/i);
  });
});
