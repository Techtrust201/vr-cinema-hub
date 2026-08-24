import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveData } from "@/hooks/useLiveData";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";
import {
  Upload, MapPin, Clapperboard, FolderOpen, Trash2, Loader2,
  FileVideo, Download, CheckCircle2, XCircle, Play, X, WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { isMovLike, resolveVideoContentType, sanitizeStorageFileName } from "@/lib/videoMime";
import { sha256HexOfBlob } from "@/lib/sha256";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";
import { generateVideoThumbnail } from "@/lib/videoThumbnail";

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
  thumbnail_url: string | null;
  created_at: string;
  uploaded_by: string | null;
}

type UploadPhase = "hashing" | "uploading" | "thumbnail" | "saving";

interface UploadProgress {
  id: string;
  name: string;
  /** 0..100 within the current phase. */
  progress: number;
  phase: UploadPhase;
  status: "uploading" | "done" | "error";
  error?: string;
  controller?: AbortController;
}

const PHASE_LABELS: Record<UploadPhase, string> = {
  hashing: "Empreinte",
  uploading: "Envoi",
  thumbnail: "Miniature",
  saving: "Enregistrement",
};

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

const THUMBNAIL_URL_TTL_SECONDS = 3600;

/**
 * Signe en un seul appel les miniatures des vidéos affichées. Le bucket est privé : sans URL
 * signée, l'image ne peut pas s'afficher. Les liens sont conservés le temps de la visite ; leur
 * durée de vie dépasse largement celle d'une consultation de la page.
 */
function useSignedThumbnails(videos: VideoRow[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  const paths = videos
    .map((v) => v.thumbnail_url)
    .filter((path): path is string => !!path);
  // Une clé stable évite de resigner à chaque rendu : useLiveData renvoie un tableau neuf
  // à chaque rafraîchissement, même quand son contenu est identique.
  const key = paths.join("|");

  useEffect(() => {
    const missing = paths.filter((path) => !urls[path]);
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.storage
        .from("thumbnails")
        .createSignedUrls(missing, THUMBNAIL_URL_TTL_SECONDS);
      if (cancelled || error || !data) return;

      const next: Record<string, string> = {};
      for (const entry of data) {
        if (entry.path && entry.signedUrl) next[entry.path] = entry.signedUrl;
      }
      setUrls((current) => ({ ...current, ...next }));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}

export default function Libraries() {
  const { canManageContent } = useAuth();
  const [activeLib, setActiveLib] = useState<LibraryType>("location");
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ video: VideoRow; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const { data, initialLoading, error: loadError, refresh, mutate } = useLiveData<VideoRow[]>(
    async (signal) => {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      if (error) throw new Error(error.message);
      return (data ?? []) as VideoRow[];
    },
  );

  const videos = data ?? [];
  const thumbnailUrls = useSignedThumbnails(videos);

  const handleFiles = (files: FileList | null) => {
    if (!files || !canManageContent) return;
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

  const setUpload = (tempId: string, patch: Partial<UploadProgress>) =>
    setUploads((u) => (u[tempId] ? { ...u, [tempId]: { ...u[tempId], ...patch } } : u));

  const cancelUpload = (tempId: string) => {
    setUploads((u) => {
      u[tempId]?.controller?.abort();
      const { [tempId]: _dropped, ...rest } = u;
      return rest;
    });
  };

  /**
   * Produit et envoie la miniature. Retourne son chemin, ou null si la génération ou l'envoi
   * échoue : la miniature est un confort d'affichage, jamais une condition de réussite.
   */
  const uploadThumbnail = async (
    file: File,
    projection: Projection,
    videoPath: string,
    signal: AbortSignal,
  ): Promise<string | null> => {
    try {
      const thumbnail = await generateVideoThumbnail(file, projection);
      if (!thumbnail) {
        console.warn("[thumbnail] génération impossible pour", file.name);
        return null;
      }

      // Même arborescence que la vidéo, avec l'extension image : le rapprochement entre un objet
      // et sa miniature reste évident depuis la console de stockage.
      const path = `${videoPath.replace(/\.[^./]+$/, "")}.jpg`;

      const { error } = await supabase.storage.from("thumbnails").upload(path, thumbnail.blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (error) {
        console.warn("[thumbnail] envoi impossible :", error.message);
        return null;
      }

      if (signal.aborted) {
        await supabase.storage.from("thumbnails").remove([path]).catch(() => undefined);
        return null;
      }

      return path;
    } catch (err) {
      console.warn("[thumbnail] échec inattendu :", err);
      return null;
    }
  };

  const confirmUpload = async (item: PendingUpload) => {
    // Block inconsistent uploads: stereo projection without known layout
    if (item.projection !== "flat" && item.stereo_mode === "unknown") {
      toast.error("Précisez le mode stéréo (mono / top_bottom / side_by_side) avant d'uploader.");
      return;
    }
    const { tempId, file, projection, stereo_mode } = item;
    removePending(tempId);
    const controller = new AbortController();
    setUploads((u) => ({
      ...u,
      [tempId]: { id: tempId, name: file.name, progress: 0, phase: "hashing", status: "uploading", controller },
    }));

    let path: string | null = null;
    let thumbnailPath: string | null = null;
    try {
      const contentType = resolveVideoContentType(file);
      if (!contentType.startsWith("video/")) {
        throw new Error(
          `Type MIME non supporté (${file.type || "inconnu"}). Utilisez MP4, MOV, M4V, WebM ou MKV.`,
        );
      }
      if (isMovLike(file)) {
        toast.message(
          "Certains codecs MOV ne sont pas compatibles avec le Quest. Un MP4 H.264/AAC est recommandé.",
        );
      }
      const safeName = sanitizeStorageFileName(file.name);
      path = `${activeLib}/${crypto.randomUUID()}-${safeName}`;

      // Streamed so a multi-gigabyte file never lands in memory at once.
      const sha256 = await sha256HexOfBlob(
        file,
        (fraction) => setUpload(tempId, { phase: "hashing", progress: Math.round(fraction * 100) }),
        controller.signal,
      );

      setUpload(tempId, { phase: "uploading", progress: 0 });
      await uploadFileWithProgress({
        bucket: "videos",
        path,
        file,
        contentType,
        onProgress: (fraction) =>
          setUpload(tempId, { phase: "uploading", progress: Math.round(fraction * 100) }),
        signal: controller.signal,
      });

      // Miniature après l'envoi de la vidéo : la vidéo est déjà en sécurité, un échec de
      // génération n'empêche donc rien. Le casque et le dashboard retombent sur une vignette
      // générée à partir du titre.
      setUpload(tempId, { phase: "thumbnail", progress: 0 });
      thumbnailPath = await uploadThumbnail(file, projection, path, controller.signal);
      setUpload(tempId, { phase: "thumbnail", progress: 100 });

      setUpload(tempId, { phase: "saving", progress: 100 });
      const { error: dbErr } = await supabase.from("videos").insert({
        name: file.name,
        library: activeLib,
        format: legacyFormatFor(projection, stereo_mode),
        projection,
        stereo_mode,
        size_bytes: file.size,
        storage_path: path,
        thumbnail_url: thumbnailPath,
        sha256,
      });
      if (dbErr) {
        await supabase.storage.from("videos").remove([path]);
        path = null;
        throw new Error(dbErr.message);
      }
      setUpload(tempId, { progress: 100, status: "done", controller: undefined });
      toast.success(`${file.name} uploadée`);
      setTimeout(() => setUploads((u) => { const { [tempId]: _dropped, ...rest } = u; return rest; }), 2500);
      void refresh();
    } catch (err) {
      // Never leave an orphan object behind in Storage.
      if (path) {
        await supabase.storage.from("videos").remove([path]).catch(() => undefined);
      }
      if (thumbnailPath) {
        await supabase.storage.from("thumbnails").remove([thumbnailPath]).catch(() => undefined);
      }
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (aborted) {
        setUploads((u) => { const { [tempId]: _dropped, ...rest } = u; return rest; });
        toast.message(`${file.name} : upload annulé`);
        return;
      }
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setUpload(tempId, { status: "error", error: message, controller: undefined });
      toast.error(`${file.name}: ${message}`);
    }
  };

  const handleDelete = async (v: VideoRow) => {
    const ok = await confirm({
      title: `Supprimer « ${v.name} » ?`,
      description: "La vidéo est retirée de la bibliothèque et du stockage. Action définitive.",
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (!ok) return;

    // The database row goes first: a leftover row pointing at a missing object
    // makes headsets fail their sync, whereas an orphan object is only wasted space.
    const previous = videos;
    mutate((current) => (current ?? []).filter((row) => row.id !== v.id));
    const { error: dbErr } = await supabase.from("videos").delete().eq("id", v.id);
    if (dbErr) {
      mutate(() => previous);
      toast.error(dbErr.message);
      return;
    }
    if (v.thumbnail_url) {
      // Une miniature orpheline n'occupe que quelques kilo-octets : son échec de suppression ne
      // mérite pas d'alerter l'utilisateur.
      await supabase.storage.from("thumbnails").remove([v.thumbnail_url]).catch(() => undefined);
    }

    const { error: stErr } = await supabase.storage.from("videos").remove([v.storage_path]);
    if (stErr && !stErr.message.includes("not found")) {
      toast.warning(`Vidéo supprimée, mais le fichier stocké subsiste : ${stErr.message}`);
      return;
    }
    toast.success("Vidéo supprimée");
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
            {canManageContent ? "Gérez la bibliothèque vidéo partagée" : "Consultez les vidéos disponibles"}
          </p>
        </div>
        {canManageContent && (
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
                {u.status === "uploading" && (
                  <span className="text-[10px] text-muted-foreground">{PHASE_LABELS[u.phase]}</span>
                )}
                <span className="text-[10px] text-muted-foreground tabular-nums">{u.progress}%</span>
                {u.status === "uploading" && (
                  <button
                    onClick={() => cancelUpload(u.id)}
                    className="p-0.5 rounded text-muted-foreground/60 hover:text-destructive transition-colors"
                    title="Annuler"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {u.status !== "error" ? (
                <div className="h-1 rounded-full bg-background overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      u.phase === "hashing"
                        ? "bg-[hsl(var(--vr-cyan))]"
                        : "bg-[hsl(var(--vr-violet))]",
                    )}
                    style={{ width: `${u.progress}%` }}
                  />
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

      {/* Drop zone (content managers) */}
      {canManageContent && (
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

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <WifiOff size={13} />
          Liste peut-être obsolète — dernière actualisation échouée ({loadError.message}).
        </div>
      )}

      {/* Videos list */}
      {initialLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 py-12 flex flex-col items-center gap-2 text-muted-foreground/50">
          <FolderOpen size={28} />
          <p className="text-sm">Aucune vidéo dans cette bibliothèque</p>
          {!canManageContent && <p className="text-xs">Demandez à un administrateur d'en ajouter</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-[hsl(var(--vr-surface)_/_0.5)] px-4 py-3 hover:border-[hsl(var(--vr-violet)_/_0.4)] transition-colors">
              {v.thumbnail_url && thumbnailUrls[v.thumbnail_url] ? (
                <img
                  src={thumbnailUrls[v.thumbnail_url]}
                  alt=""
                  className="h-9 w-16 shrink-0 rounded object-cover bg-black"
                />
              ) : (
                <div className="h-9 w-16 shrink-0 rounded bg-[hsl(var(--vr-violet)_/_0.1)] flex items-center justify-center">
                  <FileVideo size={16} className="text-[hsl(var(--vr-violet))]" />
                </div>
              )}
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
              {canManageContent && (
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
      {confirmDialog}
    </div>
  );
}
