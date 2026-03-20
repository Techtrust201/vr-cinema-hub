import { useState, useMemo } from "react";
import { useVRStore, type Library } from "@/store/vrStore";
import { cn } from "@/lib/utils";
import {
  Download,
  FileJson,
  FileText,
  Copy,
  Check,
  Library as LibraryIcon,
  Film,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FlatVideo {
  library: string;
  libraryId: string;
  playlist: string;
  name: string;
  format: string;
  stereo: string;
  sizeGB: number;
  duration: string;
  addedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flattenLibraries(libraries: Library[]): FlatVideo[] {
  const rows: FlatVideo[] = [];
  for (const lib of libraries) {
    for (const pl of lib.playlists) {
      for (const v of pl.videos) {
        rows.push({
          library: lib.name,
          libraryId: lib.id,
          playlist: pl.name,
          name: v.name,
          format: v.format,
          stereo: v.stereo,
          sizeGB: v.sizeGB,
          duration: v.duration,
          addedAt: new Date(v.addedAt).toLocaleDateString("fr-FR"),
        });
      }
    }
  }
  return rows;
}

function toCSV(rows: FlatVideo[]): string {
  const headers = ["Bibliothèque", "Playlist", "Nom du fichier", "Format", "Stéréo", "Taille (GB)", "Durée", "Ajouté le"];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [r.library, r.playlist, r.name, r.format, r.stereo, r.sizeGB, r.duration, r.addedAt]
        .map(escape)
        .join(",")
    ),
  ];
  return lines.join("\n");
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const FORMAT_LABELS: Record<string, string> = { "360": "360°", "180": "180°" };
const STEREO_LABELS: Record<string, string> = { mono: "Mono", sbs: "SBS", ou: "OU" };

// ─── Pill badge ──────────────────────────────────────────────────────────────

function Pill({ label, type }: { label: string; type: "format" | "stereo" | "library" }) {
  const cls = {
    format:
      "bg-[hsl(var(--vr-violet)_/_0.1)] text-[hsl(var(--vr-violet))] border-[hsl(var(--vr-violet)_/_0.25)]",
    stereo:
      "bg-[hsl(var(--vr-cyan)_/_0.08)] text-[hsl(var(--vr-cyan))] border-[hsl(var(--vr-cyan)_/_0.25)]",
    library:
      "bg-[hsl(140_70%_40%_/_0.08)] text-[hsl(140_70%_55%)] border-[hsl(140_70%_40%_/_0.2)]",
  }[type];
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border", cls)}>
      {label}
    </span>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Export() {
  const { libraries } = useVRStore();
  const [filterLibrary, setFilterLibrary] = useState<string>("all");
  const [copied, setCopied] = useState(false);

  const allVideos = useMemo(() => flattenLibraries(libraries), [libraries]);

  const filtered = useMemo(
    () => (filterLibrary === "all" ? allVideos : allVideos.filter((v) => v.libraryId === filterLibrary)),
    [allVideos, filterLibrary]
  );

  const totalSizeGB = filtered.reduce((s, v) => s + v.sizeGB, 0);

  // Stats per library
  const libStats = useMemo(() => {
    const map: Record<string, { name: string; count: number; sizeGB: number }> = {};
    for (const lib of libraries) {
      let count = 0;
      let size = 0;
      for (const pl of lib.playlists) {
        count += pl.videos.length;
        size += pl.videos.reduce((s, v) => s + v.sizeGB, 0);
      }
      map[lib.id] = { name: lib.name, count, sizeGB: size };
    }
    return map;
  }, [libraries]);

  const handleDownloadJSON = () => {
    const manifest = {
      exportedAt: new Date().toISOString(),
      totalVideos: filtered.length,
      totalSizeGB: parseFloat(totalSizeGB.toFixed(2)),
      libraries: libraries
        .filter((lib) => filterLibrary === "all" || lib.id === filterLibrary)
        .map((lib) => ({
          id: lib.id,
          name: lib.name,
          playlists: lib.playlists.map((pl) => ({
            id: pl.id,
            name: pl.name,
            videos: pl.videos.map((v) => ({
              name: v.name,
              format: v.format,
              stereo: v.stereo,
              sizeGB: v.sizeGB,
              duration: v.duration,
              addedAt: v.addedAt,
            })),
          })),
        })),
    };
    downloadBlob(JSON.stringify(manifest, null, 2), "vr-ultimate-manifest.json", "application/json");
    toast.success("Manifest JSON téléchargé");
  };

  const handleDownloadCSV = () => {
    downloadBlob(toCSV(filtered), "vr-ultimate-videos.csv", "text/csv;charset=utf-8;");
    toast.success("Export CSV téléchargé");
  };

  const handleCopy = async () => {
    const text = filtered.map((v) => v.name).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${filtered.length} noms de fichiers copiés`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Export / Manifest</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allVideos.length} vidéo{allVideos.length !== 1 ? "s" : ""} au total ·{" "}
            {allVideos.reduce((s, v) => s + v.sizeGB, 0).toFixed(1)} GB
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={handleDownloadJSON}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet)_/_0.12)] hover:bg-[hsl(var(--vr-violet)_/_0.2)] border border-[hsl(var(--vr-violet)_/_0.3)] text-[hsl(var(--vr-violet))] text-sm font-medium transition-all active:scale-[0.97]"
          >
            <FileJson size={15} />
            Télécharger JSON
          </button>
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--vr-cyan)_/_0.08)] hover:bg-[hsl(var(--vr-cyan)_/_0.15)] border border-[hsl(var(--vr-cyan)_/_0.25)] text-[hsl(var(--vr-cyan))] text-sm font-medium transition-all active:scale-[0.97]"
          >
            <FileText size={15} />
            Télécharger CSV
          </button>
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all active:scale-[0.97]",
              copied
                ? "bg-[hsl(140_70%_40%_/_0.12)] border-[hsl(140_70%_40%_/_0.3)] text-[hsl(140_70%_55%)]"
                : "bg-muted/40 hover:bg-muted/70 border-border/50 text-foreground"
            )}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copié !" : "Copier la liste"}
          </button>
        </div>
      </div>

      {/* Library stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* All */}
        <button
          onClick={() => setFilterLibrary("all")}
          className={cn(
            "flex flex-col gap-1 p-4 rounded-xl border text-left transition-all",
            filterLibrary === "all"
              ? "bg-[hsl(var(--vr-violet)_/_0.1)] border-[hsl(var(--vr-violet)_/_0.35)] shadow-[0_0_14px_hsl(var(--vr-violet)_/_0.12)]"
              : "bg-[hsl(var(--vr-surface))] border-border/50 hover:border-border"
          )}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter size={11} />
            Toutes les bibliothèques
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">{allVideos.length}</p>
          <p className="text-[11px] text-muted-foreground/70">{allVideos.reduce((s, v) => s + v.sizeGB, 0).toFixed(1)} GB</p>
        </button>

        {libraries.map((lib) => {
          const s = libStats[lib.id];
          const active = filterLibrary === lib.id;
          return (
            <button
              key={lib.id}
              onClick={() => setFilterLibrary(lib.id)}
              className={cn(
                "flex flex-col gap-1 p-4 rounded-xl border text-left transition-all",
                active
                  ? "bg-[hsl(140_70%_40%_/_0.08)] border-[hsl(140_70%_40%_/_0.3)] shadow-[0_0_14px_hsl(140_70%_40%_/_0.1)]"
                  : "bg-[hsl(var(--vr-surface))] border-border/50 hover:border-border"
              )}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Library size={11} />
                {s.name}
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{s.count}</p>
              <p className="text-[11px] text-muted-foreground/70">{s.sizeGB.toFixed(1)} GB</p>
            </button>
          );
        })}

        {/* Total size summary */}
        <div className="flex flex-col gap-1 p-4 rounded-xl border bg-[hsl(var(--vr-surface))] border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Download size={11} />
            Sélection actuelle
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">{filtered.length}</p>
          <p className="text-[11px] text-muted-foreground/70">{totalSizeGB.toFixed(1)} GB</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 overflow-hidden bg-[hsl(var(--vr-surface))]">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Film size={12} />
            {filtered.length} fichier{filtered.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground/70 font-mono">{totalSizeGB.toFixed(2)} GB total</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Fichier</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px] hidden sm:table-cell">Bibliothèque</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px] hidden md:table-cell">Playlist</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Format</th>
                <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Stéréo</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Taille</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px] hidden lg:table-cell">Durée</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px] hidden xl:table-cell">Ajouté le</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr
                  key={`${v.libraryId}-${v.name}-${i}`}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-foreground/90 text-[11px] break-all">{v.name}</span>
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    <Pill label={v.library} type="library" />
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="text-muted-foreground/80 truncate max-w-[160px] block">{v.playlist}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Pill label={FORMAT_LABELS[v.format] ?? v.format} type="format" />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Pill label={STEREO_LABELS[v.stereo] ?? v.stereo} type="stereo" />
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-foreground/80 tabular-nums whitespace-nowrap">
                    {v.sizeGB.toFixed(1)} GB
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-muted-foreground/70 tabular-nums hidden lg:table-cell">
                    {v.duration}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground/60 hidden xl:table-cell">
                    {v.addedAt}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground/60">
                    Aucune vidéo dans cette bibliothèque.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shell snippet hint */}
      <div className="rounded-xl border border-border/40 bg-[hsl(var(--vr-surface))] p-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Utilisation en script shell</p>
        <pre className="text-[11px] font-mono text-muted-foreground/80 whitespace-pre-wrap leading-relaxed bg-background/50 rounded-lg px-3 py-2.5 border border-border/30">
{`# Copier tous les fichiers vers le casque
while IFS= read -r f; do
  adb push "/videos/vr-ultimate/$f" /sdcard/Movies/VR_Ultimate/
done <<< "$(cat filenames.txt)"`}
        </pre>
      </div>
    </div>
  );
}
