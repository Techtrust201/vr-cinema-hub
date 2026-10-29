import { describe, expect, it } from "vitest";
import { describeYawOffset, normalizeYawOffset, yawLimit, yawPresets } from "./yawOffset";

describe("normalizeYawOffset", () => {
  it("ramène un 360 dans ]-180, 180]", () => {
    expect(normalizeYawOffset(90, "360")).toBe(90);
    expect(normalizeYawOffset(180, "360")).toBe(180);
    expect(normalizeYawOffset(-180, "360")).toBe(180);
    expect(normalizeYawOffset(270, "360")).toBe(-90);
    expect(normalizeYawOffset(-450, "360")).toBe(-90);
    expect(normalizeYawOffset(360, "360")).toBe(0);
  });

  it("arrondit au degré, ce que la base et le curseur attendent", () => {
    expect(normalizeYawOffset(44.6, "360")).toBe(45);
    expect(normalizeYawOffset(-0.4, "360")).toBe(0);
    expect(Object.is(normalizeYawOffset(-0.4, "360"), -0)).toBe(false);
  });

  it("borne un 180 à un quart de tour, au-delà le noir passerait devant", () => {
    expect(normalizeYawOffset(135, "180")).toBe(90);
    expect(normalizeYawOffset(-135, "180")).toBe(-90);
    expect(normalizeYawOffset(30, "180")).toBe(30);
  });

  it("n'oriente jamais un écran plat", () => {
    expect(normalizeYawOffset(90, "flat")).toBe(0);
    expect(yawLimit("flat")).toBe(0);
    expect(yawPresets("flat")).toEqual([]);
  });

  it("neutralise une valeur absente ou invalide", () => {
    expect(normalizeYawOffset(Number.NaN, "360")).toBe(0);
    expect(normalizeYawOffset(Number.POSITIVE_INFINITY, "180")).toBe(0);
  });

  it("ne propose que des raccourcis enregistrables tels quels", () => {
    for (const projection of ["360", "180"] as const) {
      for (const preset of yawPresets(projection)) {
        expect(normalizeYawOffset(preset.value, projection)).toBe(preset.value);
      }
    }
  });
});

describe("describeYawOffset", () => {
  it("dit où se trouve le sujet en mots", () => {
    expect(describeYawOffset(0)).toMatch(/centre/);
    expect(describeYawOffset(90)).toBe("90° à droite");
    expect(describeYawOffset(-45)).toBe("45° à gauche");
    expect(describeYawOffset(180)).toBe("derrière le spectateur");
  });
});
