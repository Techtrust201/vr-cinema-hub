import { describe, expect, it } from "vitest";
import { computeSourceRect, type ThumbnailFormat } from "@/lib/videoThumbnail";

const TARGET_RATIO = 640 / 360;

/** Raccourci de lecture : la plupart des cas ne font varier qu'un attribut. */
function format(patch: Partial<ThumbnailFormat> = {}): ThumbnailFormat {
  return { projection: "360", stereo: "mono", sourceLayout: "equirectangular", ...patch };
}

/** La zone retenue doit tenir dans l'image source, sinon drawImage recopie du vide. */
function expectInside(
  rect: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
) {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(width + 0.001);
  expect(rect.y + rect.height).toBeLessThanOrEqual(height + 0.001);
}

describe("computeSourceRect", () => {
  describe("projection plate", () => {
    it("recadre les côtés d'une vidéo plus large que 16:9", () => {
      const rect = computeSourceRect(2000, 1000, format({ projection: "flat" }));
      expect(rect.width / rect.height).toBeCloseTo(TARGET_RATIO, 5);
      expect(rect.height).toBe(1000);
      // Le recadrage est centré : autant retiré à gauche qu'à droite.
      expect(rect.x).toBeCloseTo((2000 - rect.width) / 2, 5);
      expectInside(rect, 2000, 1000);
    });

    it("recadre le haut et le bas d'une vidéo plus haute que 16:9", () => {
      const rect = computeSourceRect(1080, 1920, format({ projection: "flat" }));
      expect(rect.width / rect.height).toBeCloseTo(TARGET_RATIO, 5);
      expect(rect.width).toBe(1080);
      expect(rect.y).toBeCloseTo((1920 - rect.height) / 2, 5);
      expectInside(rect, 1080, 1920);
    });

    it("ne recadre rien quand la vidéo est déjà en 16:9", () => {
      const rect = computeSourceRect(1920, 1080, format({ projection: "flat" }));
      expect(rect).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080 });
    });

    it("ignore un relief annoncé sur une image plate", () => {
      // Le relief n'a pas de sens sur un écran, et la base l'interdit déjà. Si une telle
      // combinaison remontait tout de même, mieux vaut la miniature entière que la moitié
      // d'une image dont rien ne dit que l'autre moitié est un second point de vue.
      const rect = computeSourceRect(1920, 1080, format({ projection: "flat", stereo: "top_bottom" }));
      expect(rect.height).toBe(1080);
    });
  });

  describe("source équirectangulaire", () => {
    it("garde une bande centrée sur l'horizon en 360", () => {
      const width = 4096;
      const height = 2048;
      const rect = computeSourceRect(width, height, format());

      // Une équirectangulaire complète est illisible réduite : seule une portion est gardée.
      expect(rect.width).toBeLessThan(width);
      expect(rect.width / rect.height).toBeCloseTo(TARGET_RATIO, 5);
      // Centrée sur l'équateur de l'image, qui correspond à l'horizon de la scène.
      expect(rect.x + rect.width / 2).toBeCloseTo(width / 2, 5);
      expect(rect.y + rect.height / 2).toBeCloseTo(height / 2, 5);
      expectInside(rect, width, height);
    });

    it("utilise toute la largeur en 180", () => {
      const rect = computeSourceRect(4096, 2048, format({ projection: "180" }));
      expect(rect.x).toBe(0);
      expect(rect.width).toBe(4096);
      expectInside(rect, 4096, 2048);
    });

    it("ne dépasse jamais la hauteur disponible sur une source très plate", () => {
      // Ici la bande calculée depuis la largeur serait plus haute que l'image elle-même.
      const rect = computeSourceRect(4096, 400, format({ projection: "180" }));
      expect(rect.height).toBe(400);
      expect(rect.y).toBe(0);
      expectInside(rect, 4096, 400);
    });
  });

  describe("relief", () => {
    it("reste dans le point de vue du haut sur une source haut/bas", () => {
      // Sans cette restriction la miniature tombe à cheval sur la frontière entre les deux
      // yeux : le bas de l'un surmonté du haut de l'autre.
      const height = 4320;
      const rect = computeSourceRect(7680, height, format({ stereo: "top_bottom" }));
      expect(rect.y + rect.height).toBeLessThanOrEqual(height / 2 + 0.001);
      // La bande est bornée par la hauteur du seul œil retenu, comme sur toute source dont
      // l'œil est plus large que 16:9 une fois la portion de largeur prélevée.
      expect(rect.height).toBe(height / 2);
      expectInside(rect, 7680, height);
    });

    it("reste dans le point de vue de gauche sur une source côte à côte", () => {
      const width = 7680;
      const rect = computeSourceRect(width, 2160, format({ stereo: "side_by_side" }));
      expect(rect.x + rect.width).toBeLessThanOrEqual(width / 2 + 0.001);
      expectInside(rect, width, 2160);
    });

    it("centre la bande sur l'horizon du seul œil retenu, non sur celui de l'image", () => {
      // L'horizon de l'œil du haut se trouve au quart de la hauteur de l'image, et non en son
      // milieu, qui est la frontière entre les deux yeux.
      const height = 4320;
      const rect = computeSourceRect(7680, height, format({ stereo: "top_bottom" }));
      expect(rect.y + rect.height / 2).toBeCloseTo(height / 4, 5);
    });
  });

  describe("source en cubemap équi-angulaire", () => {
    const width = 3840;
    const height = 2160;

    it("isole la face avant, case centrale de la rangée du haut", () => {
      const rect = computeSourceRect(width, height, format({ sourceLayout: "equiangular_cubemap" }));

      // La face avant occupe le tiers central en largeur et la moitié haute en hauteur.
      expect(rect.x).toBeGreaterThanOrEqual(width / 3);
      expect(rect.x + rect.width).toBeLessThanOrEqual(2 * width / 3 + 0.001);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height / 2 + 0.001);
      expect(rect.width / rect.height).toBeCloseTo(TARGET_RATIO, 5);
      expectInside(rect, width, height);
    });

    it("écarte le remplissage des bords de face", () => {
      // L'encodeur ajoute deux pixels de remplissage sur chaque bord : les inclure laisserait
      // paraître un liseré emprunté à la face voisine.
      const rect = computeSourceRect(width, height, format({ sourceLayout: "equiangular_cubemap" }));
      expect(rect.x).toBeGreaterThan(width / 3);
      expect(rect.x + rect.width).toBeLessThan(2 * width / 3);
    });

    it("combine cubemap et relief haut/bas", () => {
      // Cas peu courant, mais les trois attributs sont indépendants : la grille de faces se
      // trouve alors dans la moitié haute de l'image.
      const rect = computeSourceRect(width, height * 2, format({
        sourceLayout: "equiangular_cubemap",
        stereo: "top_bottom",
      }));
      expect(rect.y + rect.height).toBeLessThanOrEqual(height / 2 + 0.001);
      expectInside(rect, width, height * 2);
    });

    it("ne tient pas compte de la géométrie annoncée", () => {
      // L'agencement des faces d'un cubemap ne dépend pas de la couverture annoncée : la face
      // avant est au même endroit dans les deux cas.
      const a = computeSourceRect(width, height, format({ sourceLayout: "equiangular_cubemap", projection: "360" }));
      const b = computeSourceRect(width, height, format({ sourceLayout: "equiangular_cubemap", projection: "180" }));
      expect(a).toEqual(b);
    });
  });
});
