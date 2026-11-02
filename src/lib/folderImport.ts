import { sortNatural } from "@/lib/naturalSort";

/**
 * Import d'un dossier de films, à la manière de Skybox : chaque dossier qui contient
 * directement des vidéos devient une playlist portant son nom. Déposer « Voyages/ », qui
 * contient « Voyage 1 - Venise/ » et « Voyage 2 - Paris/ », crée donc deux playlists.
 */

export interface ImportedFile {
  file: File;
  /** Dossiers traversés depuis l'élément déposé. Vide pour un fichier déposé seul. */
  dirs: string[];
}

export interface FolderGroup {
  /** Nom de la playlist : celui du dossier qui contient directement les vidéos. */
  name: string;
  /** En ordre naturel des noms de fichiers : c'est l'ordre de lecture proposé. */
  files: File[];
}

export interface ImportPlan {
  /** Fichiers déposés hors de tout dossier : envoyés en bibliothèque, comme avant. */
  loose: File[];
  folders: FolderGroup[];
  /** Fichiers non vidéo rencontrés dans les dossiers (images, textes…), laissés de côté. */
  ignored: number;
}

// Fichiers que le système range dans les dossiers sans que l'utilisateur les voie : une
// archive décompressée sur Mac en est pleine.
function isSystemName(name: string): boolean {
  return name.startsWith(".") || name === "__MACOSX" || name === "Thumbs.db" || name === "desktop.ini";
}

export function planImport(entries: readonly ImportedFile[], isVideo: (file: File) => boolean): ImportPlan {
  const loose: File[] = [];
  const byDir = new Map<string, { dirs: string[]; files: File[] }>();
  let ignored = 0;

  for (const { file, dirs } of entries) {
    if (isSystemName(file.name) || dirs.some(isSystemName)) continue;
    if (dirs.length === 0) {
      loose.push(file);
      continue;
    }
    if (!isVideo(file)) {
      ignored += 1;
      continue;
    }
    const key = dirs.join("/");
    const group = byDir.get(key) ?? { dirs, files: [] };
    group.files.push(file);
    byDir.set(key, group);
  }

  const groups = [...byDir.values()];
  const leafCount = new Map<string, number>();
  for (const g of groups) {
    const leaf = g.dirs[g.dirs.length - 1].trim().toLocaleLowerCase("fr");
    leafCount.set(leaf, (leafCount.get(leaf) ?? 0) + 1);
  }

  // Deux dossiers « Jour 1 » rangés sous des parents différents donneraient deux playlists
  // indiscernables dans le casque : le chemin complet les distingue.
  const folders = groups.map((g) => {
    const leaf = g.dirs[g.dirs.length - 1].trim();
    const collides = (leafCount.get(leaf.toLocaleLowerCase("fr")) ?? 0) > 1;
    return {
      name: collides ? g.dirs.map((d) => d.trim()).join(" - ") : leaf,
      files: sortNatural(g.files, (f) => f.name),
    };
  });

  return { loose, folders: sortNatural(folders, (f) => f.name), ignored };
}

/** Fichiers choisis avec un sélecteur de dossier (`webkitdirectory`). */
export function filesFromDirectoryInput(files: FileList | readonly File[] | null): ImportedFile[] {
  return Array.from(files ?? []).map((file) => {
    const parts = (file.webkitRelativePath || file.name).split("/");
    return { file, dirs: parts.slice(0, -1) };
  });
}

/**
 * Lit un glisser-déposer qui contient au moins un dossier, ou renvoie `null` s'il n'y a que
 * des fichiers.
 *
 * À appeler pendant l'événement `drop` : passé ce moment, le navigateur vide le
 * `DataTransfer` et les dossiers deviennent illisibles.
 */
export function readDroppedFolders(dataTransfer: DataTransfer): Promise<ImportedFile[]> | null {
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry?.() ?? null : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (!entries.some((entry) => entry.isDirectory)) return null;
  return collectEntries(entries);
}

export async function collectEntries(entries: readonly FileSystemEntry[]): Promise<ImportedFile[]> {
  const out: ImportedFile[] = [];
  const walk = async (entry: FileSystemEntry, dirs: string[]): Promise<void> => {
    if (entry.isFile) {
      out.push({ file: await fileOf(entry as FileSystemFileEntry), dirs });
      return;
    }
    if (!entry.isDirectory || isSystemName(entry.name)) return;
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
    for (const child of children) await walk(child, [...dirs, entry.name]);
  };
  for (const entry of entries) await walk(entry, []);
  return out;
}

// `readEntries` ne rend qu'un lot (cent entrées sous Chrome) : sans rappel jusqu'au lot vide,
// un dossier de cent vingt films n'en importerait que cent, sans aucun message.
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}
