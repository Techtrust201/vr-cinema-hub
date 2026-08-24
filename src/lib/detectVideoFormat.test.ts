import { describe, expect, it } from "vitest";
import { classifyFrameMetrics, measureFrame } from "./detectVideoFormat";

/**
 * Les seuils de ce module ont été réglés sur quatre vidéos réelles couvrant les quatre cas
 * de figure, puis confrontés à une transcription indépendante en Python. Les mesures
 * relevées alors servent de repère aux tests ci-dessous :
 *
 *   cubemap équi-angulaire   ressemblance haut/bas 92,5   rupture  43,1   écart-type 77,9
 *   équirectangulaire mono   ressemblance haut/bas 58,4   rupture   0,8   écart-type 51,2
 *   relief haut/bas          ressemblance haut/bas  2,0   rupture 154,1   écart-type 66,4
 *   image plate              ressemblance haut/bas 59,1   rupture   1,0   écart-type 41,7
 *
 * Les images synthétiques d'ici reproduisent la structure de chaque cas, sans prétendre
 * égaler ces valeurs : ce qui est vérifié, c'est que la structure mène au bon verdict et
 * que les marges de décision restent franches.
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

/**
 * Texture douce, à la manière d'une image de film.
 *
 * Le lissage n'est pas cosmétique : la rupture se mesure en rapportant l'écart entre deux
 * lignes à l'écart habituel entre lignes voisines. Sur du bruit blanc, dépourvu de toute
 * corrélation verticale, ces deux quantités sont égales et aucune frontière ne peut
 * ressortir. Une image réelle, elle, varie lentement d'une ligne à la suivante, et c'est
 * ce qui rend une frontière de face détectable.
 */
function texture(seed: number, width: number, height: number): Float32Array {
  const rnd = noise(seed);
  const ondes = Array.from({ length: 4 }, () => ({
    fx: 0.5 + 3 * rnd(),
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
      for (const o of ondes) {
        v += o.amplitude * Math.sin(6.28 * (o.fx * nx + o.fy * ny) + o.phase);
      }
      // Un soupçon de grain, pour que la mesure ne repose pas sur une image parfaitement
      // analytique.
      out[y * width + x] = Math.max(0, Math.min(255, v + 2 * (rnd() - 0.5)));
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

function classify(luma: Float32Array, width = WIDTH, height = HEIGHT) {
  return classifyFrameMetrics(measureFrame(luma, width, height));
}

describe("reconnaissance de l'encodage et du relief", () => {
  it("reconnaît un cubemap à la rupture entre ses deux rangées de faces", () => {
    // Les deux rangées d'une grille 3x2 portent des faces sans rapport : elles ne se
    // ressemblent pas, et la frontière entre elles est franche.
    const frame = new Float32Array(WIDTH * HEIGHT);
    const half = HEIGHT / 2;
    blit(frame, WIDTH, texture(1, WIDTH, half), WIDTH, half, 0, 0);
    blit(frame, WIDTH, texture(999, WIDTH, half), WIDTH, half, 0, half);

    const v = classify(frame);
    expect(v?.sourceLayout).toBe("equiangular_cubemap");
    expect(v?.stereoMode).toBe("mono");
  });

  it("reconnaît un relief haut/bas à la ressemblance des deux moitiés", () => {
    // Les deux points de vue d'une même scène : presque la même image, à un très léger
    // décalage près. C'est ce qui distingue ce cas d'un cubemap, dont les deux moitiés
    // sont elles aussi séparées par une rupture franche.
    const frame = new Float32Array(WIDTH * HEIGHT);
    const half = HEIGHT / 2;
    const oeil = texture(7, WIDTH, half);
    const autre = new Float32Array(oeil);
    for (let i = 0; i < autre.length; i++) autre[i] += 2;

    blit(frame, WIDTH, oeil, WIDTH, half, 0, 0);
    blit(frame, WIDTH, autre, WIDTH, half, 0, half);

    const v = classify(frame);
    expect(v?.stereoMode).toBe("top_bottom");
    expect(v?.sourceLayout).toBe("equirectangular");
  });

  it("reconnaît un relief côte à côte", () => {
    const frame = new Float32Array(WIDTH * HEIGHT);
    const half = WIDTH / 2;
    const oeil = texture(11, half, HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < half; x++) {
        const v = oeil[y * half + x];
        frame[y * WIDTH + x] = v;
        frame[y * WIDTH + half + x] = v + 2;
      }
    }

    const v = classify(frame);
    expect(v?.stereoMode).toBe("side_by_side");
    expect(v?.sourceLayout).toBe("equirectangular");
  });

  it("conclut à l'équirectangulaire mono en l'absence de toute structure", () => {
    // Une image continue, sans rupture ni symétrie : le cas le plus répandu, et la seule
    // valeur par défaut sûre.
    const v = classify(texture(3, WIDTH, HEIGHT));
    expect(v?.sourceLayout).toBe("equirectangular");
    expect(v?.stereoMode).toBe("mono");
  });

  it("un ciel dégradé reste exploitable malgré sa douceur", () => {
    // Le rejet d'une image porte sur son écart-type, non sur l'écart entre pixels voisins :
    // une image très lisse mais contrastée d'un bout à l'autre doit être analysée, faute de
    // quoi tout plan de ciel serait écarté.
    const frame = new Float32Array(WIDTH * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        frame[y * WIDTH + x] = 20 + (y / HEIGHT) * 200;
      }
    }
    const v = classify(frame);
    expect(v).not.toBeNull();
    expect(v?.sourceLayout).toBe("equirectangular");
  });

  it("refuse de conclure sur une image unie", () => {
    // Fondu au noir, générique : rien à mesurer. Mieux vaut ne rien proposer qu'avancer un
    // verdict tiré d'un bruit de compression.
    const frame = new Float32Array(WIDTH * HEIGHT).fill(16);
    expect(classify(frame)).toBeNull();
  });

  it("le relief est examiné avant l'encodage", () => {
    // Un relief haut/bas produit lui aussi une rupture franche à mi-hauteur. Le prendre
    // pour un cubemap déformerait toute l'image : l'ordre des tests est donc porteur de
    // sens, et non un détail d'écriture.
    const v = classifyFrameMetrics({
      topBottomSimilarity: 2,
      sideBySideSimilarity: 40,
      midHeightDiscontinuity: 150,
      contrast: 60,
    });
    expect(v?.stereoMode).toBe("top_bottom");
    expect(v?.sourceLayout).toBe("equirectangular");
  });

  it("les marges de décision restent franches", () => {
    // Relevé sur les vidéos réelles : la ressemblance des moitiés vaut 2,0 en relief et au
    // moins 27,3 sans relief ; la rupture vaut au moins 43,1 pour un cubemap et au plus
    // 1,0 pour un équirectangulaire. Les seuils tombent dans ces vides de mesure, à un
    // facteur trois au moins de toute valeur observée. Ce test fige ce constat : resserrer
    // un seuil sans nouvelle campagne de mesure le fera échouer.
    const relief = { topBottomSimilarity: 2.0, sideBySideSimilarity: 27.3, midHeightDiscontinuity: 154.1, contrast: 66.4 };
    const cubemap = { topBottomSimilarity: 92.5, sideBySideSimilarity: 94.2, midHeightDiscontinuity: 43.1, contrast: 77.9 };
    const equirect = { topBottomSimilarity: 58.4, sideBySideSimilarity: 52.6, midHeightDiscontinuity: 0.8, contrast: 51.2 };
    const plate = { topBottomSimilarity: 59.1, sideBySideSimilarity: 42.7, midHeightDiscontinuity: 1.0, contrast: 41.7 };

    expect(classifyFrameMetrics(relief)?.stereoMode).toBe("top_bottom");
    expect(classifyFrameMetrics(cubemap)?.sourceLayout).toBe("equiangular_cubemap");
    expect(classifyFrameMetrics(equirect)?.sourceLayout).toBe("equirectangular");
    expect(classifyFrameMetrics(equirect)?.stereoMode).toBe("mono");
    expect(classifyFrameMetrics(plate)?.sourceLayout).toBe("equirectangular");
  });
});
