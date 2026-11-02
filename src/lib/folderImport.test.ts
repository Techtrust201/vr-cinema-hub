import { describe, expect, it } from "vitest";
import { collectEntries, filesFromDirectoryInput, planImport, type ImportedFile } from "./folderImport";

const video = (name: string) => new File(["x"], name, { type: "video/mp4" });
const isVideo = (file: File) => file.type.startsWith("video/");

describe("planImport", () => {
  it("fait une playlist de chaque dossier qui contient directement des vidéos", () => {
    const entries: ImportedFile[] = [
      { file: video("Vidéo 10.mp4"), dirs: ["Voyages", "Voyage 1 - Venise"] },
      { file: video("Vidéo 2.mp4"), dirs: ["Voyages", "Voyage 1 - Venise"] },
      { file: video("Arrivée.mp4"), dirs: ["Voyages", "Voyage 2 - Paris"] },
    ];
    const plan = planImport(entries, isVideo);
    expect(plan.folders.map((f) => f.name)).toEqual(["Voyage 1 - Venise", "Voyage 2 - Paris"]);
    expect(plan.folders[0].files.map((f) => f.name)).toEqual(["Vidéo 2.mp4", "Vidéo 10.mp4"]);
    expect(plan.loose).toEqual([]);
  });

  it("laisse les fichiers déposés seuls à l'envoi habituel, sans playlist", () => {
    const seul = video("Seul.mp4");
    const plan = planImport([{ file: seul, dirs: [] }], isVideo);
    expect(plan.loose).toEqual([seul]);
    expect(plan.folders).toEqual([]);
  });

  it("ignore les fichiers système et compte les autres fichiers non vidéo", () => {
    const entries: ImportedFile[] = [
      { file: new File(["x"], ".DS_Store"), dirs: ["Voyage 1"] },
      { file: video("film.mp4"), dirs: ["__MACOSX", "Voyage 1"] },
      { file: new File(["x"], "affiche.jpg", { type: "image/jpeg" }), dirs: ["Voyage 1"] },
      { file: video("film.mp4"), dirs: ["Voyage 1"] },
    ];
    const plan = planImport(entries, isVideo);
    expect(plan.folders).toHaveLength(1);
    expect(plan.folders[0].files).toHaveLength(1);
    expect(plan.ignored).toBe(1);
  });

  it("distingue deux dossiers de même nom par leur chemin", () => {
    const entries: ImportedFile[] = [
      { file: video("a.mp4"), dirs: ["Venise", "Jour 1"] },
      { file: video("b.mp4"), dirs: ["Paris", "Jour 1"] },
    ];
    expect(planImport(entries, isVideo).folders.map((f) => f.name)).toEqual(["Paris - Jour 1", "Venise - Jour 1"]);
  });
});

describe("filesFromDirectoryInput", () => {
  it("retrouve les dossiers dans le chemin relatif fourni par le sélecteur", () => {
    const file = video("a.mp4");
    Object.defineProperty(file, "webkitRelativePath", { value: "Voyages/Voyage 1 - Venise/a.mp4" });
    expect(filesFromDirectoryInput([file])[0].dirs).toEqual(["Voyages", "Voyage 1 - Venise"]);
  });
});

// Imite l'API des entrées de glisser-déposer, y compris le découpage de readEntries en lots.
function fakeFile(file: File): FileSystemFileEntry {
  return { isFile: true, isDirectory: false, name: file.name, file: (ok: (f: File) => void) => ok(file) } as unknown as FileSystemFileEntry;
}
function fakeDir(name: string, children: FileSystemEntry[], batchSize = 100): FileSystemDirectoryEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (ok: (batch: FileSystemEntry[]) => void) => {
          const batch = children.slice(offset, offset + batchSize);
          offset += batch.length;
          ok(batch);
        },
      };
    },
  } as unknown as FileSystemDirectoryEntry;
}

describe("collectEntries", () => {
  it("lit un dossier en entier, même au-delà du premier lot rendu par le navigateur", async () => {
    const files = Array.from({ length: 250 }, (_, i) => fakeFile(video(`v${i}.mp4`)));
    const collected = await collectEntries([fakeDir("Voyage 1", files)]);
    expect(collected).toHaveLength(250);
    expect(collected[0].dirs).toEqual(["Voyage 1"]);
  });

  it("descend dans les sous-dossiers en gardant le chemin", async () => {
    const tree = fakeDir("Voyages", [fakeDir("Voyage 2 - Paris", [fakeFile(video("a.mp4"))])]);
    const [entry] = await collectEntries([tree]);
    expect(entry.dirs).toEqual(["Voyages", "Voyage 2 - Paris"]);
  });
});
