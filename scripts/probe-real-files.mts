// Confronte l'analyseur de format aux vrais fichiers, en comparant son verdict
// à celui de ffprobe. Les tests unitaires travaillent sur des fichiers
// fabriqués ; celui-ci vérifie que le parseur tient face à de véritables MP4.
//
//   npx vite-node scripts/probe-real-files.mts -- <dossier ou fichiers>
import { execFileSync } from "node:child_process";
import { openAsBlob } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { probeVideoFile } from "../src/lib/probeVideoFile";

const args = process.argv.slice(2).filter((a) => a !== "--");
const target = args[0] ?? "origin/data/location";

async function listFiles(): Promise<string[]> {
  if (args.length > 1) return args.map((a) => resolve(a));
  try {
    const entries = await readdir(target);
    return entries.filter((f) => /\.(mp4|mov|webm|mkv)$/i.test(f)).map((f) => resolve(join(target, f)));
  } catch {
    return args.map((a) => resolve(a));
  }
}

function ffprobe(path: string): { codec: string; width: string; height: string } | null {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", path],
      { encoding: "utf8" },
    ).trim();
    const [codec, width, height] = out.split(",");
    return { codec, width, height };
  } catch {
    return null;
  }
}

const files = await listFiles();
if (files.length === 0) {
  console.error(`Aucun fichier vidéo trouvé dans « ${target} ».`);
  process.exit(1);
}

let mismatches = 0;

for (const path of files) {
  const blob = await openAsBlob(path);
  // probeVideoFile n'a besoin que de `name`, `size` et `slice`.
  const file = Object.assign(blob, { name: basename(path) }) as unknown as File;

  const probe = await probeVideoFile(file);
  const ref = ffprobe(path);

  const refLabel = ref ? `${ref.codec} ${ref.width}×${ref.height}` : "ffprobe indisponible";
  const agree =
    !ref ||
    (probe.codecLabel.toLowerCase().includes(ref.codec === "h264" ? "h.264" : ref.codec === "hevc" ? "hevc" : ref.codec) &&
      String(probe.width) === ref.width &&
      String(probe.height) === ref.height);

  if (!agree) mismatches++;

  console.log(`${agree ? "OK   " : "ÉCART"} ${basename(path)}`);
  console.log(`      analyseur : ${probe.codecLabel} ${probe.width}×${probe.height} — verdict « ${probe.verdict} »`);
  console.log(`      ffprobe   : ${refLabel}`);
  console.log(`      message   : ${probe.message}`);
  if (probe.advice) console.log(`      conseil   : ${probe.advice}`);
  console.log();
}

console.log(`${files.length - mismatches}/${files.length} fichiers analysés conformément à ffprobe.`);
process.exit(mismatches ? 1 : 0);
