import { describe, expect, it } from "vitest";
import { inferFormatFromFilename, shouldAutoSend } from "./inferVideoFormatFromName";

describe("inferFormatFromFilename", () => {
  it("lit le cubemap YouTube 360 mono malgré « 2D single »", () => {
    const name =
      "1 - Paris (partenaire) - video VR paramétrée dans Skybox selon format 'Youtube', '2D single', 'VR360'.mp4";
    expect(inferFormatFromFilename(name)).toMatchObject({
      projection: "360",
      stereoMode: "mono",
      sourceLayout: "equiangular_cubemap",
      named: true,
    });
  });

  it("lit l'équirectangulaire 360 mono Skybox Ordinaire", () => {
    const name =
      "2 - Paris - video VR paramétrée dans Skybox selon format 'Ordinaire', '2D single', 'VR360'.mp4";
    expect(inferFormatFromFilename(name)).toMatchObject({
      projection: "360",
      stereoMode: "mono",
      sourceLayout: "equirectangular",
      named: true,
    });
  });

  it("lit le 360 en relief haut/bas", () => {
    const name =
      "3 - Sintra, video 360 paramétrée dans Skybox selon format 'Ordinaire', '3D haut bas', 'VR360'.mp4";
    expect(inferFormatFromFilename(name)).toMatchObject({
      projection: "360",
      stereoMode: "top_bottom",
      sourceLayout: "equirectangular",
      named: true,
    });
  });

  it("lit le cinéma 2D, pas une sphère", () => {
    const name =
      "4 - notre dame d'afrique - video 2D paramétrée dans Skybox selon format 'Ordinaire', '2D single', 'cinéma'.MOV";
    expect(inferFormatFromFilename(name)).toMatchObject({
      projection: "flat",
      stereoMode: "mono",
      sourceLayout: "equirectangular",
      named: true,
    });
  });

  it("ne prend pas un nom sobre pour argent comptant", () => {
    expect(inferFormatFromFilename("visite.mp4").named).toBe(false);
    expect(shouldAutoSend(inferFormatFromFilename("visite.mp4"))).toBe(false);
  });

  it("envoie tout seul les quatre exports Skybox du client", () => {
    const names = [
      "1 - Paris (partenaire) - video VR paramétrée dans Skybox selon format 'Youtube', '2D single', 'VR360'.mp4",
      "2 - Paris - video VR paramétrée dans Skybox selon format 'Ordinaire', '2D single', 'VR360'.mp4",
      "3 - Sintra, video 360 paramétrée dans Skybox selon format 'Ordinaire', '3D haut bas', 'VR360'.mp4",
      "4 - notre dame d'afrique - video 2D paramétrée dans Skybox selon format 'Ordinaire', '2D single', 'cinéma'.MOV",
    ];
    for (const name of names) {
      expect(shouldAutoSend(inferFormatFromFilename(name))).toBe(true);
    }
  });
});
