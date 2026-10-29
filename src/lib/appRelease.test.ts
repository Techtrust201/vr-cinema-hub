import { describe, expect, it } from "vitest";
import { compareVersions, formatApkSize, formatReleaseDate, isOutdated } from "./appRelease";

describe("compareVersions", () => {
  it("compare numériquement, pas comme du texte", () => {
    expect(compareVersions("1.1.10", "1.1.9")).toBe(1);
    expect(compareVersions("1.1.6", "1.1.7")).toBe(-1);
    expect(compareVersions("1.1.7", "1.1.7")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  it("refuse de trancher sur un numéro illisible", () => {
    expect(compareVersions("dev", "1.1.7")).toBeNull();
    expect(compareVersions("1.1.7-staging", "1.1.7")).toBeNull();
  });
});

describe("isOutdated", () => {
  it("signale un casque plus ancien que la dernière version publiée", () => {
    expect(isOutdated("1.1.6", "1.1.7")).toBe(true);
  });

  it("ne signale ni un casque à jour, ni un build plus récent, ni une version inconnue", () => {
    expect(isOutdated("1.1.7", "1.1.7")).toBe(false);
    expect(isOutdated("1.1.8", "1.1.7")).toBe(false);
    expect(isOutdated(null, "1.1.7")).toBe(false);
    expect(isOutdated("1.1.6", null)).toBe(false);
    expect(isOutdated("inconnue", "1.1.7")).toBe(false);
  });
});

describe("formatReleaseDate", () => {
  it("affiche l'heure de Paris, heure d'hiver comme d'été", () => {
    expect(formatReleaseDate("2026-10-29T13:32:00Z")).toBe("29/10/2026 à 14:32");
    expect(formatReleaseDate("2026-07-01T13:32:00Z")).toBe("01/07/2026 à 15:32");
  });

  it("ne plante pas sur une date absente", () => {
    expect(formatReleaseDate("pas une date")).toBe("date inconnue");
  });
});

describe("formatApkSize", () => {
  it("parle en mégaoctets", () => {
    expect(formatApkSize(54_041_786)).toBe("52 Mo");
  });
});
