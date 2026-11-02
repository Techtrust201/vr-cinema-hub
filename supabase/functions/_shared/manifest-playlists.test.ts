import { describe, expect, it } from "vitest";

import { buildManifestPlaylists, orderPlaylists, orderPlaylistVideos } from "./manifest-playlists";

const venise = { id: "p-venise", name: "Voyage 1 - Venise", position: 2 };
const paris = { id: "p-paris", name: "Voyage 2 - Paris", position: 1 };

describe("orderPlaylists", () => {
  it("suit la position choisie sur le tableau de bord, pas le nom", () => {
    expect(orderPlaylists([venise, paris]).map((p) => p.id)).toEqual(["p-paris", "p-venise"]);
  });

  it("départage deux positions égales par tri naturel du nom", () => {
    const dix = { id: "a", name: "Voyage 10", position: 3 };
    const deux = { id: "b", name: "Voyage 2", position: 3 };
    expect(orderPlaylists([dix, deux]).map((p) => p.name)).toEqual(["Voyage 2", "Voyage 10"]);
  });
});

describe("orderPlaylistVideos", () => {
  it("range dossier par dossier, puis par position dans le dossier", () => {
    const rows = [
      { playlist_id: "p-venise", video_id: "v3", position: 1 },
      { playlist_id: "p-paris", video_id: "v2", position: 2 },
      { playlist_id: "p-paris", video_id: "v1", position: 1 },
    ];
    const ordered = orderPlaylistVideos(rows, ["p-paris", "p-venise"]);
    expect(ordered.map((r) => r.video_id)).toEqual(["v1", "v2", "v3"]);
  });
});

describe("buildManifestPlaylists", () => {
  const rows = [
    { playlist_id: "p-paris", video_id: "v1", position: 1 },
    { playlist_id: "p-paris", video_id: "v2", position: 2 },
    { playlist_id: "p-venise", video_id: "v1", position: 1 },
  ];

  it("garde une vidéo présente dans deux dossiers dans chacun d'eux", () => {
    const playlists = buildManifestPlaylists([paris, venise], rows, new Set(["v1", "v2"]));
    expect(playlists).toEqual([
      { id: "p-paris", name: "Voyage 2 - Paris", position: 1, video_ids: ["v1", "v2"] },
      { id: "p-venise", name: "Voyage 1 - Venise", position: 2, video_ids: ["v1"] },
    ]);
  });

  it("n'annonce jamais une vidéo absente de la liste à télécharger", () => {
    const playlists = buildManifestPlaylists([paris], rows, new Set(["v2"]));
    expect(playlists[0].video_ids).toEqual(["v2"]);
  });

  it("transmet un dossier vide : c'est au casque de ne pas l'afficher", () => {
    const vide = { id: "p-vide", name: "Bientôt", position: 9 };
    expect(buildManifestPlaylists([vide], rows, new Set(["v1"]))[0].video_ids).toEqual([]);
  });
});
