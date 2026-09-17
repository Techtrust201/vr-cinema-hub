import { describe, it, expect } from "vitest";
import { legacyFormatFor } from "./legacyVideoFormat";

describe("legacyFormatFor", () => {
  it("ignore le relief pour un film sur écran", () => {
    expect(legacyFormatFor("flat", "mono")).toBe("flat");
    expect(legacyFormatFor("flat", "side_by_side")).toBe("flat");
  });

  it("distingue 360 et 180 sans relief", () => {
    expect(legacyFormatFor("360", "mono")).toBe("360_mono");
    expect(legacyFormatFor("180", "mono")).toBe("180_mono");
  });

  it("reconnaît le relief quelle que soit la disposition des deux yeux", () => {
    expect(legacyFormatFor("360", "top_bottom")).toBe("360_stereo");
    expect(legacyFormatFor("360", "side_by_side")).toBe("360_stereo");
    expect(legacyFormatFor("180", "top_bottom")).toBe("180_stereo");
    expect(legacyFormatFor("180", "side_by_side")).toBe("180_stereo");
  });

  it("traite un relief indéterminé comme du relief", () => {
    // Un film en relief affiché à plat montre les deux yeux côte à côte : inutilisable.
    // L'inverse reste regardable, donc c'est le défaut le moins dommageable.
    expect(legacyFormatFor("360", "unknown")).toBe("360_stereo");
    expect(legacyFormatFor("180", "unknown")).toBe("180_stereo");
  });
});
