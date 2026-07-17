import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Upload, MapPin, Clapperboard, FolderOpen, Trash2, Loader2,
  FileVideo, Download, CheckCircle2, XCircle, Play, X,
} from "lucide-react";
import { toast } from "sonner";

type LibraryType = "location" | "animation";
type VrFormat = "360_mono" | "180_mono" | "360_stereo" | "180_stereo" | "flat";
type Projection = "360" | "180" | "flat";
type StereoMode = "mono" | "top_bottom" | "side_by_side" | "unknown";

interface VideoRow {
  id: string;
  name: string;
  library: LibraryType;
  format: VrFormat;
  projection: Projection;
  stereo_mode: StereoMode;
  size_bytes: number;
  storage_path: string;
  created_at: string;
  uploaded_by: string | null;
}

interface UploadProgress {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

function detectFormat(name: string): VrFormat {
  const n = name.toLowerCase();
  const is180 = n.includes("180");
  const isStereo = n.includes("sbs") || n.includes("3d") || n.includes("stereo") || n.includes("_ou");
  if (is180 && isStereo) return "180_stereo";
  if (is180) return "180_mono";
  if (isStereo) return "360_stereo";
  return "360_mono";
}

function suggestProjection(name: string): Projection {
  const n = name.toLowerCase();
  if (n.includes("180")) return "180";
  if (n.includes("flat") || n.includes("2d")) return "flat";
  return "360";
}

function suggestStereo(name: string): StereoMode {
  const n = name.toLowerCase();
  if (n.includes("sbs") || n.includes("side_by_side") || n.includes("side-by-side")) return "side_by_side";
  if (n.includes("tb") || n.includes("top_bottom") || n.includes("top-bottom") || n.includes("_ou")) return "top_bottom";
  if (n.includes("stereo") || n.includes("3d")) return "unknown";
  return "mono";
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const FORMAT_LABELS: Record<VrFormat, string> = {
  "360_mono": "360° mono",
  "180_mono": "180° mono",
  "360_stereo": "360° stéréo",
  "180_stereo": "180° stéréo",
  "flat": "2D plat",
};

const PROJECTION_LABELS: Record<Projection, string> = {
  "360": "360°",
  "180": "180°",
  "flat": "Plat (2D)",
};
const STEREO_LABELS: Record<StereoMode, string> = {
  mono: "Mono",
  top_bottom: "Top / Bottom",
  side_by_side: "Side by Side",
  unknown: "Stéréo (inconnu)",
};

interface PendingUpload {
  tempId: string;
  file: File;
  projection: Projection;
  stereo_mode: StereoMode;
}

export default function Libraries() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [activeLib, setActiveLib] = useState<LibraryType>("location");
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ video: VideoRow; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erreur de chargement: " + error.message);
    else setVideos((data ?? []) as VideoRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleFiles = (files: FileList | null) => {
    if (!files || !isAdmin) return;
    const next: PendingUpload[] = Array.from(files).map((file) => ({
      tempId: `up-${Date.now()}-${Math.random()}`,
      file,
      projection: suggestProjection(file.name),
      stereo_mode: suggestStereo(file.name),
    }));
    setPending((p) => [...p, ...next]);
  };

  const updatePending = (tempId: string, patch: Partial<PendingUpload>) => {
    setPending((p) =>
      p.map((it) => {
        if (it.tempId !== tempId) return it;
        const merged = { ...it, ...patch };
        // Enforce: flat ⇒ mono
        if (merged.projection === "flat") merged.stereo_mode = "mono";
        return merged;
      }),
    );
  };

  const removePending = (tempId: string) =>
    setPending((p) => p.filter((it) => it.tempId !== tempId));

  const legacyFormatFor = (projection: Projection, stereo: StereoMode): VrFormat => {
    if (projection === "flat") return "flat";
    const isStereo = stereo !== "mono";
    if (projection === "180") return isStereo ? "180_stereo" : "180_mono";
    return isStereo ? "360_stereo" : "360_mono";
  };

  const sha256Hex = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const confirmUpload = async (item: PendingUpload) => {
    // Block inconsistent uploads: stereo projection without known layout
    if (item.projection !== "flat" && item.stereo_mode === "unknown") {
      toast.error("Précisez le mode stéréo (mono / top_bottom / side_by_side) avant d'uploader.");
      return;
    }
    const { tempId, file, projection, stereo_mode } = item;
    removePending(tempId);
    setUploads((u) => ({ ...u, [tempId]: { id: tempId, name: file.name, progress: 0, status: "uploading" } }));
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${activeLib}/${crypto.randomUUID()}-${safeName}`;
      const sha256 = await sha256Hex(file);
      const { error: upErr } = await supabase.storage
        .from("videos")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      setUploads((u) => ({ ...u, [tempId]: { ...u[tempId], progress: 95 } }));
      const { error: dbErr } = await supabase.from("videos").insert({
        name: file.name,
        library: activeLib,
        format: legacyFormatFor(projection, stereo_mode),
        projection,
        stereo_mode,
        size_bytes: file.size,
        storage_path: path,
        sha256,
      });
      if (dbErr) {
        await supabase.storage.from("videos").remove([path]);
        throw dbErr;
      }
      setUploads((u) => ({ ...u, [tempId]: { ...u[tempId], progress: 100, status: "done" } }));
      toast.success(`${file.name} uploadée`);
      setTimeout(() => setUploads((u) => { const { [tempId]: _, ...rest } = u; return rest; }), 2500);
      fetchVideos();
    } catch (err: any) {
      setUploads((u) => ({ ...u, [tempId]: { ...u[tempId], status: "error", error: err.message } }));
      toast.error(`${file.name}: ${err.message}`);
    }
  };

  const handleDelete = async (v: VideoRow) => {
    if (!confirm(`Supprimer "${v.name}" définitivement ?`)) return;
    const { error: stErr } = await supabase.storage.from("videos").remove([v.storage_path]);
    if (stErr && !stErr.message.includes("not found")) {
      toast.error("Storage: " + stErr.message);
      return;
    }
    const { error: dbErr } = await supabase.from("videos").delete().eq("id", v.id);
    if (dbErr) { toast.error(dbErr.message); return; }
    toast.success("Vidéo supprimée");
    fetchVideos();
  };

  const handleDownload = async (v: VideoRow) => {
    const { data, error } = await supabase.storage
      .from("videos")
      .createSignedUrl(v.storage_path, 3600);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const handlePreview = async (v: VideoRow) => {
    setPreviewLoading(v.id);
    const { data, error } = await supabase.storage
      .from("videos")
      .createSignedUrl(v.storage_path, 3600);
    setPreviewLoading(null);
    if (error || !data) { toast.error(error?.message ?? "URL indisponible"); return; }
    setPreview({ video: v, url: data.signedUrl });
  };

  const filtered = videos.filter((v) => v.library === activeLib);

  const tabs: { id: LibraryType; label: string; icon: typeof MapPin }[] = [
    { id: "location", label: "Location", icon: MapPin },
    { id: "animation", label: "Animations", icon: Clapperboard },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bibliothèques</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? "Gérez la bibliothèque vidéo partagée" : "Consultez les vidéos disponibles"}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white text-sm font-medium hover:bg-[hsl(var(--vr-violet)_/_0.85)] transition-colors"
          >
            <Upload size={14} /> Uploader des vidéos
          </button>
        )}
        <input ref={fileRef} type="file" multiple accept="video/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/50">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveLib(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 -mb-px text-sm font-medium border-b-2 transition-all",
              activeLib === id
                ? id === "location"
                  ? "border-[hsl(var(--vr-violet))] text-[hsl(var(--vr-violet))]"
                  : "border-[hsl(var(--vr-cyan))] text-[hsl(var(--vr-cyan))]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={15} />
            {label}
            <span className="text-xs text-muted-foreground/60">
              ({videos.filter((v) => v.library === id).length})
            </span>
          </button>
        ))}
      </div>

      {/* Upload progress */}
      {Object.values(uploads).length > 0 && (
        <div className="space-y-2">
          {Object.values(uploads).map((u) => (
            <div key={u.id} className="rounded-lg border border-border/60 bg-[hsl(var(--vr-surface)_/_0.5)] p-3">
              <div className="flex items-center gap-2 mb-1.5">
                {u.status === "uploading" && <Loader2 size={13} className="text-[hsl(var(--vr-violet))] animate-spin" />}
                {u.status === "done" && <CheckCircle2 size={13} className="text-[hsl(140_70%_55%)]" />}
                {u.status === "error" && <XCircle size={13} className="text-destructive" />}
                <span className="text-xs font-medium truncate flex-1">{u.name}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{u.progress}%</span>
              </div>
              {u.status !== "error" ? (
                <div className="h-1 rounded-full bg-background overflow-hidden">
                  <div className="h-full bg-[hsl(var(--vr-violet))] transition-all" style={{ width: `${u.progress}%` }} />
                </div>
              ) : (
                <p className="text-[10px] text-destructive">{u.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pending uploads — confirm projection / stereo */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">
            Confirmez le format VR avant upload ({pending.length})
          </p>
          {pending.map((it) => {
            const isFlat = it.projection === "flat";
            const stereoUnknown = !isFlat && it.stereo_mode === "unknown";
            return (
              <div key={it.tempId} className="rounded-lg border border-[hsl(var(--vr-violet)_/_0.4)] bg-[hsl(var(--vr-surface)_/_0.5)] p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <FileVideo size={14} className="text-[hsl(var(--vr-violet))]" />
                  <span className="text-xs font-medium truncate flex-1">{it.file.name}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtSize(it.file.size)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-muted-foreground space-y-1">
                    <span>Projection</span>
                    <select
                      value={it.projection}
                      onChange={(e) => updatePending(it.tempId, { projection: e.target.value as Projection })}
                      className="w-full rounded bg-background border border-border/60 px-2 py-1.5 text-xs text-foreground"
                    >
                      {(["360", "180", "flat"] as Projection[]).map((p) => (
                        <option key={p} value={p}>{PROJECTION_LABELS[p]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] text-muted-foreground space-y-1">
                    <span>Stéréo</span>
                    <select
                      value={it.stereo_mode}
                      disabled={isFlat}
                      onChange={(e) => updatePending(it.tempId, { stereo_mode: e.target.value as StereoMode })}
                      className="w-full rounded bg-background border border-border/60 px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                    >
                      {(["mono", "top_bottom", "side_by_side", "unknown"] as StereoMode[]).map((s) => (
                        <option key={s} value={s}>{STEREO_LABELS[s]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {stereoUnknown && (
                  <p className="text-[10px] text-amber-500">
                    Précisez le mode stéréo (top/bottom ou side-by-side) avant d'uploader.
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => removePending(it.tempId)}
                    className="text-[11px] px-2.5 py-1.5 rounded text-muted-foreground hover:text-foreground"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => confirmUpload(it)}
                    disabled={stereoUnknown}
                    className="text-[11px] px-3 py-1.5 rounded bg-[hsl(var(--vr-violet))] text-white font-medium hover:bg-[hsl(var(--vr-violet)_/_0.85)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Uploader
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drop zone (admin only) */}
      {isAdmin && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "rounded-xl border-2 border-dashed px-6 py-8 flex flex-col items-center gap-2 cursor-pointer transition-all",
            dragging
              ? "border-[hsl(var(--vr-violet))] bg-[hsl(var(--vr-violet)_/_0.08)]"
              : "border-border/50 hover:border-[hsl(var(--vr-violet)_/_0.4)] hover:bg-[hsl(var(--vr-violet)_/_0.04)]"
          )}
        >
          <Upload size={20} className={dragging ? "text-[hsl(var(--vr-violet))]" : "text-muted-foreground/50"} />
          <p className="text-sm text-muted-foreground">
            Glissez vos vidéos ici ou <span className="text-[hsl(var(--vr-violet))]">cliquez pour parcourir</span>
          </p>
          <p className="text-[10px] text-muted-foreground/40">
            mp4, mov, mkv • bibliothèque <strong>{activeLib === "location" ? "Location" : "Animations"}</strong>
          </p>
        </div>
      )}

      {/* Videos list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 py-12 flex flex-col items-center gap-2 text-muted-foreground/50">
          <FolderOpen size={28} />
          <p className="text-sm">Aucune vidéo dans cette bibliothèque</p>
          {!isAdmin && <p className="text-xs">Demandez à un administrateur d'en ajouter</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-[hsl(var(--vr-surface)_/_0.5)] px-4 py-3 hover:border-[hsl(var(--vr-violet)_/_0.4)] transition-colors">
              <FileVideo size={16} className="text-[hsl(var(--vr-violet))] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{v.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {PROJECTION_LABELS[v.projection] ?? v.projection} • {STEREO_LABELS[v.stereo_mode] ?? v.stereo_mode} • {fmtSize(v.size_bytes)} • ajoutée le {new Date(v.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <button
                onClick={() => handleDownload(v)}
                className="p-2 rounded text-muted-foreground hover:text-[hsl(var(--vr-cyan))] hover:bg-[hsl(var(--vr-cyan)_/_0.1)] transition-colors"
                title="Télécharger"
              >
                <Download size={13} />
              </button>
              <button
                onClick={() => handlePreview(v)}
                disabled={previewLoading === v.id}
                className="p-2 rounded text-muted-foreground hover:text-[hsl(var(--vr-violet))] hover:bg-[hsl(var(--vr-violet)_/_0.1)] transition-colors disabled:opacity-50"
                title="Prévisualiser"
              >
                {previewLoading === v.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              </button>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(v)}
                  className="p-2 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Supprimer"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative w-full max-w-4xl rounded-xl border border-[hsl(var(--vr-violet)_/_0.4)] bg-[hsl(var(--vr-surface))] p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <FileVideo size={16} className="text-[hsl(var(--vr-violet))]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{preview.video.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {PROJECTION_LABELS[preview.video.projection] ?? preview.video.projection} • {STEREO_LABELS[preview.video.stereo_mode] ?? preview.video.stereo_mode} • {fmtSize(preview.video.size_bytes)}
                </p>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-background"
                title="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <video
              src={preview.url}
              controls
              autoPlay
              className="w-full max-h-[70vh] rounded-lg bg-black"
              onError={() => toast.error("Lecture impossible — vidéo corrompue ou format non supporté par le navigateur")}
            />
            <p className="text-[10px] text-muted-foreground">
              Aperçu équirectangulaire 2D (le rendu VR immersif se fait dans le casque). Si la vidéo ne se lit pas ici, le navigateur ne supporte pas son codec — mais elle peut quand même fonctionner sur le Quest.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
