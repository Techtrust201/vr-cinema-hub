import { describe, expect, it } from "vitest";
import {
  classify, classifyFrame, describeFormat, eyeRect, measureEye, measureStereo,
  type EyeMetrics, type StereoMetrics,
} from "./detectVideoFormat";

/**
 * Les seuils de ce module ont été réglés sur cinq images réelles couvrant les cinq cas de
 * figure, puis confrontés à une transcription indépendante en Python. Les mesures relevées
 * alors servent de repère aux tests ci-dessous :
 *
 *                            ressembl.  rupture  bouclage  pôles
 *   cubemap 360                   92,5    43,05     27,47  0,475
 *   équirectangulaire 360         58,4     0,76      1,37  0,032
 *   équirectangulaire 360 relief   2,0     1,09      1,28  0,039
 *   équirectangulaire 180         64,1     0,66     11,01  0,028
 *   image plate                   59,1     1,02      7,27  0,737
 *
 * Les images synthétiques d'ici reproduisent la structure de chaque cas sans prétendre
 * égaler ces valeurs : ce qui est vérifié, c'est que la structure mène au bon verdict.
 */

const WIDTH = 240;
const HEIGHT = 360;

/** Suite déterministe, pour que l'échec d'un test soit reproductible. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface TextureOptions {
  /** Le bord gauche prolonge le bord droit, comme sur une couverture de 360 degrés. */
  wraps?: boolean;
  /** Lignes extrêmes constantes, comme les pôles d'une image sphérique. */
  uniformPoles?: boolean;
}

/**
 * Texture douce, à la manière d'une image de film.
 *
 * Le lissage n'est pas cosmétique : les ruptures se mesurent en rapportant un écart à
 * l'écart habituel entre voisins. Sur du bruit blanc, dépourvu de toute corrélation, ces
 * deux quantités sont égales et aucune structure ne peut ressortir. Une image réelle, elle,
 * varie lentement, et c'est ce qui rend une frontière détectable.
 */
function texture(
  seed: number,
  width: number,
  height: number,
  { wraps = false, uniformPoles = false }: TextureOptions = {},
): Float32Array {
  const rnd = noise(seed);
  const ondes = Array.from({ length: 4 }, () => ({
    // Une fréquence entière en x referme l'image sur elle-même ; une fréquence fractionnaire
    // laisse une marche entre les deux bords.
    fx: wraps ? 1 + Math.floor(4 * rnd()) : 0.7 + 3 * rnd(),
    fy: 0.5 + 3 * rnd(),
    phase: 6.28 * rnd(),
    amplitude: 15 + 35 * rnd(),
  }));

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      let v = 128;
      for (const o of ondes) v += o.amplitude * Math.sin(6.28 * (o.fx * nx + o.fy * ny) + o.phase);
      out[y * width + x] = Math.max(0, Math.min(255, v + 2 * (rnd() - 0.5)));
    }
  }

  if (uniformPoles) {
    // Dans une image sphérique, la ligne du haut représente le zénith : une direction
    // unique, donc une valeur unique.
    for (const y of [0, 1, 2, height - 3, height - 2, height - 1]) {
      const value = out[y * width + Math.floor(width / 2)];
      for (let x = 0; x < width; x++) out[y * width + x] = value;
    }
  }

  return out;
}

function blit(
  dst: Float32Array,
  dstWidth: number,
  src: Float32Array,
  srcWidth: number,
  srcHeight: number,
  x0: number,
  y0: number,
) {
  for (let y = 0; y < srcHeight; y++) {
    for (let x = 0; x < srcWidth; x++) {
      dst[(y0 + y) * dstWidth + x0 + x] = src[y * srcWidth + x];
    }
  }
}

function verdict(luma: Float32Array, width = WIDTH, height = HEIGHT) {
  return classifyFrame(luma, width, height);
}

/** Empile deux points de vue presque identiques, comme le fait une source en relief. */
function stackedEyes(eye: Float32Array, width: number, eyeHeight: number, vertical: boolean) {
  if (vertical) {
    const frame = new Float32Array(width * eyeHeight * 2);
    blit(frame, width, eye, width, eyeHeight, 0, 0);
    const other = eye.map((v) => v + 2);
    blit(frame, width, other, width, eyeHeight, 0, eyeHeight);
    return frame;
  }
  const frame = new Float32Array(width * 2 * eyeHeight);
  for (let y = 0; y < eyeHeight; y++) {
    for (let x = 0; x < width; x++) {
      const v = eye[y * width + x];
      frame[y * width * 2 + x] = v;
      frame[y * width * 2 + width + x] = v + 2;
    }
  }
  return frame;
}

describe("reconnaissance du format d'une vidéo", () => {
  describe("encodage", () => {
    it("reconnaît un cubemap à la rupture entre ses deux rangées de faces", () => {
      // Les deux rangées d'une grille 3x2 portent des faces sans rapport : la frontière
      // entre elles est franche.
      const frame = new Float32Array(WIDTH * HEIGHT);
      const half = HEIGHT / 2;
      blit(frame, WIDTH, texture(1, WIDTH, half), WIDTH, half, 0, 0);
      blit(frame, WIDTH, texture(999, WIDTH, half), WIDTH, half, 0, half);

      const v = verdict(frame);
      expect(v?.sourceLayout).toBe("equiangular_cubemap");
      // Un cubemap couvre la sphère entière : sa géométrie découle de son encodage, et non
      // de ses bords, qui ne se referment pas.
      expect(v?.projection).toBe("360");
    });

    it("conclut à l'encodage courant en l'absence de cette rupture", () => {
      const v = verdict(texture(3, WIDTH, HEIGHT, { wraps: true, uniformPoles: true }));
      expect(v?.sourceLayout).toBe("equirectangular");
    });
  });

  describe("géométrie", () => {
    it("reconnaît une couverture de 360 degrés au bouclage des bords", () => {
      const v = verdict(texture(5, WIDTH, HEIGHT, { wraps: true, uniformPoles: true }));
      expect(v?.projection).toBe("360");
    });

    it("reconnaît une couverture de 180 degrés : pas de bouclage, mais des pôles", () => {
      // Une demi-sphère ne se referme pas latéralement, mais garde ses pôles au zénith et
      // au nadir.
      const v = verdict(texture(6, WIDTH, HEIGHT, { wraps: false, uniformPoles: true }));
      expect(v?.projection).toBe("180");
    });

    it("reconnaît une image plate : ni bouclage, ni pôles", () => {
      const v = verdict(texture(7, WIDTH, HEIGHT, { wraps: false, uniformPoles: false }));
      expect(v?.projection).toBe("flat");
    });

    it("le bouclage seul suffit à conclure à 360, même sans pôles nets", () => {
      // Une 360 dont la couverture verticale est rognée n'a plus de pôles francs. Ses bords
      // se referment pourtant, et cela suffit : c'est le cas d'une des vidéos de référence.
      const v = verdict(texture(8, WIDTH, HEIGHT, { wraps: true, uniformPoles: false }));
      expect(v?.projection).toBe("360");
    });
  });

  describe("relief", () => {
    it("reconnaît deux yeux superposés à leur ressemblance", () => {
      const eye = texture(11, WIDTH, HEIGHT / 2, { wraps: true, uniformPoles: true });
      const v = verdict(stackedEyes(eye, WIDTH, HEIGHT / 2, true), WIDTH, HEIGHT);
      expect(v?.stereoMode).toBe("top_bottom");
      expect(v?.projection).toBe("360");
    });

    it("reconnaît deux yeux côte à côte", () => {
      const eye = texture(13, WIDTH / 2, HEIGHT, { wraps: true, uniformPoles: true });
      const v = verdict(stackedEyes(eye, WIDTH / 2, HEIGHT, false), WIDTH, HEIGHT);
      expect(v?.stereoMode).toBe("side_by_side");
      expect(v?.projection).toBe("360");
    });

    it("mesure la géométrie dans un seul œil, non sur l'image entière", () => {
      // Sans cela, la frontière entre les deux yeux passerait pour une rupture du contenu et
      // ferait prendre une source en relief pour un cubemap. Relevé sur la vidéo de
      // référence : rupture de 154 mesurée sur l'image entière, 1,09 sur un seul œil.
      const eye = texture(17, WIDTH, HEIGHT / 2, { wraps: true, uniformPoles: true });
      const frame = stackedEyes(eye, WIDTH, HEIGHT / 2, true);

      const surTout = measureEye(frame, WIDTH, eyeRect(WIDTH, HEIGHT, "mono"));
      const surUnOeil = measureEye(frame, WIDTH, eyeRect(WIDTH, HEIGHT, "top_bottom"));
      expect(surUnOeil.rowSplit).toBeLessThan(surTout.rowSplit);
      expect(verdict(frame)?.sourceLayout).toBe("equirectangular");
    });

    it("n'attribue jamais de relief à une image plate", () => {
      // Le relief n'a pas de sens sur un écran. Une image plate dont les deux moitiés se
      // ressemblent par hasard ne doit pas être coupée en deux.
      const v = classify(
        { topBottomSimilarity: 2, sideBySideSimilarity: 40, contrast: 60 },
        { rowSplit: 1, wrap: 8, poleUniformity: 0.8 },
      );
      expect(v?.projection).toBe("flat");
      expect(v?.stereoMode).toBe("mono");
    });
  });

  describe("refus de conclure", () => {
    it("refuse une image unie", () => {
      // Fondu au noir, générique : rien à mesurer. Mieux vaut ne rien proposer qu'avancer un
      // verdict tiré d'un bruit de compression.
      expect(verdict(new Float32Array(WIDTH * HEIGHT).fill(16))).toBeNull();
    });

    it("accepte un ciel dégradé, lisse mais contrasté", () => {
      // Le rejet porte sur l'écart-type, non sur l'écart entre pixels voisins : sinon tout
      // plan de ciel serait écarté.
      const frame = new Float32Array(WIDTH * HEIGHT);
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) frame[y * WIDTH + x] = 20 + (y / HEIGHT) * 200;
      }
      expect(verdict(frame)).not.toBeNull();
    });
  });

  describe("enchaînement des décisions", () => {
    const relief: StereoMetrics = { topBottomSimilarity: 2.0, sideBySideSimilarity: 27.3, contrast: 66.4 };
    const sansRelief: StereoMetrics = { topBottomSimilarity: 58.4, sideBySideSimilarity: 52.6, contrast: 51.2 };

    it("le relief est déterminé avant tout le reste", () => {
      // Il dit quelle portion de l'image constitue un point de vue : tout le reste en dépend.
      const v = classify(relief, { rowSplit: 1.09, wrap: 1.28, poleUniformity: 0.039 });
      expect(v?.stereoMode).toBe("top_bottom");
      expect(v?.projection).toBe("360");
    });

    it("l'encodage est déterminé avant la géométrie", () => {
      // Les bords d'un cubemap ne se referment pas, faute de quoi il serait pris pour une
      // image plate ou une 180.
      const v = classify(sansRelief, { rowSplit: 43.05, wrap: 27.47, poleUniformity: 0.475 });
      expect(v?.sourceLayout).toBe("equiangular_cubemap");
      expect(v?.projection).toBe("360");
    });

    it("les marges de décision restent franches", () => {
      // Relevé sur les images réelles. Ce test fige le constat : resserrer un seuil sans
      // nouvelle campagne de mesure le fera échouer.
      const reels: Array<[string, StereoMetrics, EyeMetrics, string]> = [
        ["cubemap", sansRelief, { rowSplit: 43.05, wrap: 27.47, poleUniformity: 0.475 }, "360|mono|equiangular_cubemap"],
        ["360 mono", sansRelief, { rowSplit: 0.76, wrap: 1.37, poleUniformity: 0.032 }, "360|mono|equirectangular"],
        ["360 relief", relief, { rowSplit: 1.09, wrap: 1.28, poleUniformity: 0.039 }, "360|top_bottom|equirectangular"],
        ["180", { topBottomSimilarity: 64.1, sideBySideSimilarity: 28.5, contrast: 48.4 }, { rowSplit: 0.66, wrap: 11.01, poleUniformity: 0.028 }, "180|mono|equirectangular"],
        ["plate", sansRelief, { rowSplit: 1.02, wrap: 7.27, poleUniformity: 0.737 }, "flat|mono|equirectangular"],
      ];

      for (const [nom, s, e, attendu] of reels) {
        const v = classify(s, e);
        expect(`${v?.projection}|${v?.stereoMode}|${v?.sourceLayout}`, nom).toBe(attendu);
      }
    });
  });

  describe("formulation", () => {
    it("décrit le format sans jargon", () => {
      const phrase = describeFormat({
        projection: "360", stereoMode: "top_bottom", sourceLayout: "equirectangular",
      });
      expect(phrase).toBe("vidéo à 360 degrés, en relief, les deux yeux superposés, encodage courant");
    });

    it("nomme l'encodage en faces de cube par son usage, non par son sigle", () => {
      const phrase = describeFormat({
        projection: "360", stereoMode: "mono", sourceLayout: "equiangular_cubemap",
      });
      expect(phrase).toContain("faces de cube");
      expect(phrase).toContain("YouTube");
    });
  });
});
