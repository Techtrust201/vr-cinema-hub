import { describe, expect, it } from "vitest";
import { computeSourceRect } from "@/lib/videoThumbnail";

const TARGET_RATIO = 640 / 360;

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
      const rect = computeSourceRect(2000, 1000, "flat");
      expect(rect.width / rect.height).toBeCloseTo(TARGET_RATIO, 5);
      expect(rect.height).toBe(1000);
      // Le recadrage est centré : autant retiré à gauche qu'à droite.
      expect(rect.x).toBeCloseTo((2000 - rect.width) / 2, 5);
      expectInside(rect, 2000, 1000);
    });

    it("recadre le haut et le bas d'une vidéo plus haute que 16:9", () => {
      const rect = computeSourceRect(1080, 1920, "flat");
      expect(rect.width / rect.height).toBeCloseTo(TARGET_RATIO, 5);
      expect(rect.width).toBe(1080);
      expect(rect.y).toBeCloseTo((1920 - rect.height) / 2, 5);
      expectInside(rect, 1080, 1920);
    });

    it("ne recadre rien quand la vidéo est déjà en 16:9", () => {
      const rect = computeSourceRect(1920, 1080, "flat");
      expect(rect).toMatchObject({ x: 0, y: 0, width: 1920, height: 1080 });
    });
  });

  describe("projections immersives", () => {
    it("garde une bande centrée sur l'horizon en 360", () => {
      const width = 4096;
      const height = 2048;
      const rect = computeSourceRect(width, height, "360");

      // Une équirectangulaire complète est illisible réduite : seule une portion est gardée.
      expect(rect.width).toBeLessThan(width);
      expect(rect.width / rect.height).toBeCloseTo(TARGET_RATIO, 5);
      // Centrée sur l'équateur de l'image, qui correspond à l'horizon de la scène.
      expect(rect.x + rect.width / 2).toBeCloseTo(width / 2, 5);
      expect(rect.y + rect.height / 2).toBeCloseTo(height / 2, 5);
      expectInside(rect, width, height);
    });

    it("utilise toute la largeur en 180", () => {
      const rect = computeSourceRect(4096, 2048, "180");
      expect(rect.x).toBe(0);
      expect(rect.width).toBe(4096);
      expectInside(rect, 4096, 2048);
    });

    it("ne dépasse jamais la hauteur disponible sur une source très plate", () => {
      // Ici la bande calculée depuis la largeur serait plus haute que l'image elle-même.
      const rect = computeSourceRect(4096, 400, "180");
      expect(rect.height).toBe(400);
      expect(rect.y).toBe(0);
      expectInside(rect, 4096, 400);
    });
  });
});
