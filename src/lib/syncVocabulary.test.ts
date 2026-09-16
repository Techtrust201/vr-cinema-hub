import { describe, expect, it } from "vitest";

import {
  describeBumpTest,
  describeCause,
  describeImpactPath,
  describeReportStatus,
  describeTrigger,
  describeVersionGap,
  humanizeCode,
} from "./syncVocabulary";

// Le client final a reproché de lire du vocabulaire de développeur. Ces tests
// vérifient qu'aucune sortie ne contient de tiret bas ni de jargon anglais,
// y compris pour les codes qu'on ne connaît pas encore.
const JARGON = /_|\bnull\b|\bundefined\b|bump|dry.?run|rollback|invalidate|resync/i;

describe("humanizeCode", () => {
  it("transforme un identifiant technique en texte lisible", () => {
    expect(humanizeCode("playlist_videos_invalidate")).toBe("Playlist videos invalidate");
    expect(humanizeCode("group:Salon Paris")).toBe("Group Salon Paris");
  });

  it("ne casse pas sur une chaîne vide", () => {
    expect(humanizeCode("")).toBe("");
  });
});

describe("describeCause", () => {
  it("traduit les causes connues", () => {
    expect(describeCause("video_update")).toBe("Un film a été modifié");
    expect(describeCause("force_resync")).toBe("Mise à jour forcée depuis le tableau de bord");
  });

  it("reste lisible quand la cause est absente ou inconnue", () => {
    expect(describeCause(null)).toBe("Mise à jour du contenu");
    expect(describeCause(undefined)).toBe("Mise à jour du contenu");
    expect(describeCause("quelque_chose_de_nouveau")).not.toMatch(/_/);
  });
});

describe("describeImpactPath", () => {
  it("explique comment la playlist atteint le casque", () => {
    expect(describeImpactPath("direct")).toBe("Attribué directement à ce casque");
    expect(describeImpactPath("all")).toBe("Attribué à tous les casques");
    expect(describeImpactPath("group:Salon Paris")).toBe("Via le groupe « Salon Paris »");
  });
});

describe("describeVersionGap", () => {
  it("dit si le casque est à jour plutôt que d'afficher des numéros", () => {
    expect(describeVersionGap(40, 40)).toBe("Contenu à jour");
    expect(describeVersionGap(41, 40)).toBe("Contenu à jour");
    expect(describeVersionGap(39, 40)).toBe("Une mise à jour en attente");
    expect(describeVersionGap(37, 40)).toBe("3 mises à jour en attente");
  });
});

describe("describeBumpTest", () => {
  it("annonce un succès sans employer de jargon", () => {
    const r = describeBumpTest({ would_bump: true, rollback_verified: true, method: "insert", reason: "ok" });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("annulée");
  });

  it("explique l'absence de playlist en termes d'usage", () => {
    const r = describeBumpTest({ would_bump: false, reason: "no_effective_playlist" });
    expect(r.ok).toBe(false);
    expect(r.title).toBe("Aucun contenu attribué");
  });

  it("distingue une playlist vide d'une absence d'attribution", () => {
    const r = describeBumpTest({ would_bump: false, reason: "playlist_empty_and_no_other_video" });
    expect(r.title).toBe("Playlist vide");
  });

  it("ne plante pas sans données", () => {
    expect(describeBumpTest(null).ok).toBe(false);
    expect(describeBumpTest(undefined).ok).toBe(false);
  });
});

describe("aucune sortie ne laisse passer de jargon", () => {
  const samples = [
    describeCause("videos_invalidate"),
    describeCause("playlist_videos_invalidate"),
    describeCause("assignments_invalidate"),
    describeCause("group_members_invalidate"),
    describeCause("force_resync"),
    describeCause(null),
    describeImpactPath("direct"),
    describeImpactPath("all"),
    describeReportStatus("no_change"),
    describeReportStatus("failed"),
    describeTrigger("videos_invalidate"),
    describeTrigger("group_members_invalidate"),
    describeVersionGap(1, 5),
    describeBumpTest({ would_bump: true, rollback_verified: true }).title,
    describeBumpTest({ would_bump: true, rollback_verified: true }).detail,
    describeBumpTest({ would_bump: false, reason: "no_effective_playlist" }).detail,
  ];

  it.each(samples)("« %s » est en français courant", (text) => {
    expect(text).not.toMatch(JARGON);
    expect(text.length).toBeGreaterThan(0);
  });
});
