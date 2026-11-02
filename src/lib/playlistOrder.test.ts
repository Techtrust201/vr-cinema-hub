import { arrayMove } from "@dnd-kit/sortable";
import { describe, expect, it } from "vitest";
import {
  isNaturallyOrdered,
  mergeSavedOrder,
  moveId,
  savedOrderStatus,
  videosInPlaybackOrder,
} from "./playlistOrder";

describe("moveId", () => {
  const ids = ["a", "b", "c", "d"];

  it("donne le même résultat qu'arrayMove quand les deux identifiants sont là", () => {
    for (const activeId of ids) {
      for (const overId of ids) {
        const from = ids.indexOf(activeId);
        const to = ids.indexOf(overId);
        expect(moveId(ids, activeId, overId)).toEqual(arrayMove(ids, from, to));
      }
    }
  });

  it("fait passer un élément vers le bas", () => {
    expect(moveId(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("fait passer un élément vers le haut", () => {
    expect(moveId(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("laisse l'ordre intact si la cible est le même identifiant", () => {
    expect(moveId(ids, "b", "b")).toEqual(ids);
  });

  it("ignore un identifiant absent plutôt que de retirer le dernier", () => {
    expect(moveId(ids, "a", "inconnu")).toEqual(ids);
    expect(moveId(ids, "inconnu", "a")).toEqual(ids);
  });

  it("ne modifie pas le tableau reçu", () => {
    const source = ["b", "a"];
    moveId(source, "b", "a");
    expect(source).toEqual(["b", "a"]);
  });
});

describe("isNaturallyOrdered", () => {
  it("range les numéros comme un humain, « Voyage 2 » avant « Voyage 10 »", () => {
    const titles = [
      { name: "Voyage 2 - Paris" },
      { name: "Voyage 10 - Rome" },
    ];
    expect(isNaturallyOrdered(titles, (item) => item.name)).toBe(true);
    expect(isNaturallyOrdered([...titles].reverse(), (item) => item.name)).toBe(false);
  });

  it("ignore la casse et les accents", () => {
    expect(isNaturallyOrdered([{ name: "Eau" }, { name: "élan" }], (item) => item.name)).toBe(true);
    expect(isNaturallyOrdered([{ name: "élan" }, { name: "Eau" }], (item) => item.name)).toBe(false);
  });

  it("accepte deux titres équivalents, une liste vide ou un seul élément", () => {
    expect(isNaturallyOrdered([{ name: "Vidéo 1" }, { name: "vidéo 1" }], (item) => item.name)).toBe(true);
    expect(isNaturallyOrdered([], (item: { name: string }) => item.name)).toBe(true);
    expect(isNaturallyOrdered([{ name: "Seul" }], (item) => item.name)).toBe(true);
  });
});

describe("videosInPlaybackOrder", () => {
  const videos = [
    { id: "rome", name: "Voyage 10 - Rome" },
    { id: "paris", name: "Voyage 2 - Paris" },
    { id: "autre", name: "Hors playlist" },
  ];

  it("trie par position croissante et ignore les autres playlists", () => {
    const links = [
      { playlist_id: "p", video_id: "rome", position: 2 },
      { playlist_id: "autre", video_id: "autre", position: 0 },
      { playlist_id: "p", video_id: "paris", position: 1 },
    ];
    expect(videosInPlaybackOrder(links, videos, "p").map((video) => video.id)).toEqual(["paris", "rome"]);
  });

  it("départage une position égale par le nom, « Voyage 2 » avant « Voyage 10 »", () => {
    const links = [
      { playlist_id: "p", video_id: "rome", position: 1 },
      { playlist_id: "p", video_id: "paris", position: 1 },
    ];
    expect(videosInPlaybackOrder(links, videos, "p").map((video) => video.name)).toEqual([
      "Voyage 2 - Paris",
      "Voyage 10 - Rome",
    ]);
  });

  it("garde une vidéo retirée de la bibliothèque, avec un nom vide", () => {
    const links = [{ playlist_id: "p", video_id: "absente", position: 1 }];
    expect(videosInPlaybackOrder(links, videos, "p")).toEqual([
      { id: "absente", name: "", position: 1 },
    ]);
  });

  it("ne modifie pas les tableaux reçus", () => {
    const links = [
      { playlist_id: "p", video_id: "rome", position: 2 },
      { playlist_id: "p", video_id: "paris", position: 1 },
    ];
    const before = links.map((link) => ({ ...link }));
    videosInPlaybackOrder(links, videos, "p");
    expect(links).toEqual(before);
  });
});

describe("savedOrderStatus", () => {
  it("reconnaît l'ordre enregistré", () => {
    expect(savedOrderStatus(["a", "b", "c"], ["a", "b", "c"])).toBe("match");
  });

  it("détecte un déplacement", () => {
    expect(savedOrderStatus(["b", "a", "c"], ["a", "b", "c"])).toBe("differs");
  });

  it("accepte un élément apparu entre-temps si les autres n'ont pas bougé", () => {
    expect(savedOrderStatus(["a", "b", "nouveau"], ["a", "b"])).toBe("match");
    expect(savedOrderStatus(["nouveau", "b", "a"], ["a", "b"])).toBe("differs");
  });

  it("signale un identifiant enregistré qui a disparu", () => {
    expect(savedOrderStatus(["a", "c"], ["a", "b", "c"])).toBe("missing");
  });
});

describe("mergeSavedOrder", () => {
  it("réécrit l'ordre enregistré et met à la fin ce qui est arrivé après", () => {
    expect(mergeSavedOrder(["c", "a", "b", "nouveau"], ["a", "b", "c"])).toEqual(["a", "b", "c", "nouveau"]);
  });

  it("omet un identifiant enregistré qui n'existe plus", () => {
    expect(mergeSavedOrder(["a", "c"], ["a", "b", "c"])).toEqual(["a", "c"]);
  });

  it("ne modifie pas les tableaux reçus", () => {
    const current = ["b", "a"];
    const saved = ["a", "b"];
    mergeSavedOrder(current, saved);
    expect(current).toEqual(["b", "a"]);
    expect(saved).toEqual(["a", "b"]);
  });
});
