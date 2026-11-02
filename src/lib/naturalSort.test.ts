import { describe, expect, it } from "vitest";
import { compareNatural, sortNatural } from "./naturalSort";

describe("sortNatural", () => {
  it("range les numéros par valeur, pas caractère par caractère", () => {
    const names = ["Voyage 10 - Rome", "Voyage 2 - Paris", "Voyage 1 - Venise"];
    expect(sortNatural(names, (n) => n)).toEqual(["Voyage 1 - Venise", "Voyage 2 - Paris", "Voyage 10 - Rome"]);
  });

  it("ignore la casse et les accents, comme un classement fait à la main", () => {
    expect(compareNatural("vidéo 1", "Video 1")).toBe(0);
    expect(sortNatural(["élan", "Eau", "ZOO"], (n) => n)).toEqual(["Eau", "élan", "ZOO"]);
  });

  it("ne modifie pas la liste reçue", () => {
    const names = ["b", "a"];
    sortNatural(names, (n) => n);
    expect(names).toEqual(["b", "a"]);
  });
});
