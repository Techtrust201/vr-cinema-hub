import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveData } from "@/hooks/useLiveData";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";
import {
  Upload, MapPin, Clapperboard, FolderOpen, Trash2, Loader2,
  FileVideo, Download, CheckCircle2, XCircle, Play, X, WifiOff, AlertTriangle,
  ImagePlus, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { isMovLike, resolveVideoContentType, sanitizeStorageFileName } from "@/lib/videoMime";
import { sha256HexOfBlob } from "@/lib/sha256";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";
import { generateVideoThumbnail, prepareImageThumbnail, IMAGE_THUMBNAIL_MAX_BYTES } from "@/lib/videoThumbnail";
import { detectVideoFormat } from "@/lib/detectVideoFormat";

type LibraryType = "location" | "animation";
type VrFormat = "360_mono" | "180_mono" | "360_stereo" | "180_stereo" | "flat";
type Projection = "360" | "180" | "flat";
type StereoMode = "mono" | "top_bottom" | "side_by_side" | "unknown";
type SourceLayout = "equirectangular" | "equiangular_cubemap";

interface VideoRow {
  id: string;
  name: string;
  library: LibraryType;
  format: VrFormat;
  projection: Projection;
  stereo_mode: StereoMode;
  source_layout: SourceLayout;
  size_bytes: number;
  storage_path: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
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

/**
 * Indices tirés du nom du fichier.
 *
 * Ce ne sont que des valeurs d'attente, affichées le temps que l'analyse de l'image se
 * prononce, et conservées uniquement si elle n'a rien pu mesurer. Un nom de fichier se
 * trompe dès qu'il est sobre : « notre-dame.mp4 » ne dit pas que la vidéo est plate.
 */
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

function fmtDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return null;
  const total = Math.round(Number(seconds));
  if (total < 0) return null;
  const m = Math.floor(total / 60);
  const r = total % 60;
  if (m <= 0) return `${total} s`;
  return `${m} min ${String(r).padStart(2, "0")} s`;
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

/**
 * Libellés du formulaire d'envoi, en français courant.
 *
 * Les termes du métier — équirectangulaire, cubemap équi-angulaire, top/bottom — ne disent
 * rien à qui n'a pas produit la vidéo. Ils sont ici remplacés par ce que le spectateur voit,
 * seul angle qui permette de reconnaître une erreur de réglage.
 */
const PROJECTION_CHOICES: Array<{ value: Projection; label: string; hint: string }> = [
  { value: "360", label: "Tout autour du spectateur", hint: "Il peut se retourner et regarder derrière lui." },
  { value: "180", label: "La moitié devant le spectateur", hint: "L'image couvre son champ de vision, mais pas ses arrières." },
  { value: "flat", label: "Un écran devant le spectateur", hint: "Comme au cinéma : une image rectangulaire posée devant lui." },
];

const STEREO_CHOICES: Array<{ value: StereoMode; label: string; hint: string }> = [
  { value: "mono", label: "Sans relief", hint: "Les deux yeux voient la même image." },
  { value: "top_bottom", label: "En relief, les deux yeux superposés", hint: "L'image contient deux vues empilées, l'une au-dessus de l'autre." },
  { value: "side_by_side", label: "En relief, les deux yeux côte à côte", hint: "L'image contient deux vues juxtaposées, l'une à côté de l'autre." },
  { value: "unknown", label: "En relief, disposition à préciser", hint: "À remplacer par l'une des deux dispositions ci-dessus avant d'envoyer." },
];

const SOURCE_LAYOUT_CHOICES: Array<{ value: SourceLayout; label: string; hint: string }> = [
  { value: "equirectangular", label: "Encodage courant", hint: "Le cas de très loin le plus répandu." },
  { value: "equiangular_cubemap", label: "Encodage en faces de cube", hint: "Celui de YouTube. Skybox le nomme « Youtube » dans ses réglages d'export." },
];

interface PendingUpload {
  tempId: string;
  file: File;
  projection: Projection;
  stereo_mode: StereoMode;
  source_layout: SourceLayout;
  /**
   * L'analyse de l'image court en fond, la vidéo n'attend pas pour s'afficher. Ce que
   * l'analyse propose ne remplace jamais une valeur déjà choisie à la main.
   */
  analysis: "running" | "done";
  /** Vrai quand les images examinées ont donné un verdict franc et unanime. */
  recognised?: boolean;
  analysisNote?: string;
  touched?: boolean;
  /** Réglages dépliés à la demande : l'essentiel doit tenir en une phrase. */
  showSettings?: boolean;
  /**
   * Aperçu rendu avec les réglages retenus. C'est lui qui rend une erreur visible avant
   * l'envoi : un mauvais encodage donne une grille de faces, un mauvais relief une image
   * coupée en deux.
   */
  previewUrl?: string;
  /** Le même contenu que l'aperçu : c'est lui qui sera envoyé comme vignette. */
  previewBlob?: Blob;
  previewDurationSeconds?: number | null;
  previewState: "idle" | "running" | "failed";
  /** L'opérateur a fourni une image : un changement de format ne l'écrase plus. */
  previewCustom?: boolean;
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const thumbnailTargetRef = useRef<VideoRow | null>(null);
  const [thumbBusy, setThumbBusy] = useState<string | null>(null);
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
      // Valeurs d'attente, le temps que l'analyse de l'image se prononce. Le nom du fichier
      // est un indice commode mais peu sûr : il n'est retenu que si l'analyse échoue.
      projection: suggestProjection(file.name),
      stereo_mode: suggestStereo(file.name),
      source_layout: "equirectangular",
      analysis: "running",
      previewState: "idle",
    }));
    setPending((p) => [...p, ...next]);
    next.forEach(analysePending);
  };

  /**
   * Examine quelques images de la vidéo pour en proposer le format.
   *
   * Rien dans ces fichiers ne le déclare : ni boîte `sv3d`, ni boîte `st3d`. Sans cette
   * analyse il faudrait le connaître de tête, et une erreur ne se verrait qu'une fois le
   * casque sur la tête.
   */
  const analysePending = async (item: PendingUpload) => {
    const detected = await detectVideoFormat(item.file);
    let retenu: PendingUpload | null = null;

    setPending((p) =>
      p.map((it) => {
        if (it.tempId !== item.tempId) return it;

        // Un réglage déjà corrigé à la main fait foi : l'analyse arrive après coup et ne doit
        // pas défaire le choix de l'opérateur.
        const merged: PendingUpload = it.touched
          ? { ...it, analysis: "done", recognised: false, analysisNote: detected.explanation }
          : {
              ...it,
              // La géométrie du nom de fichier n'est conservée que si l'analyse n'a rien pu
              // mesurer : elle se trompe dès qu'un fichier est nommé sobrement.
              projection: detected.confident ? detected.projection : it.projection,
              stereo_mode: detected.confident ? detected.stereoMode : it.stereo_mode,
              source_layout: detected.sourceLayout,
              analysis: "done",
              recognised: detected.confident,
              analysisNote: detected.explanation,
            };

        if (merged.projection === "flat") {
          merged.stereo_mode = "mono";
          merged.source_layout = "equirectangular";
        }
        retenu = merged;
        return merged;
      }),
    );

    if (retenu) refreshPreview(retenu);
  };

  /**
   * Reconstruit l'aperçu avec les réglages courants.
   *
   * C'est ce qui permet de juger un réglage sans casque : une source en faces de cube lue
   * comme une image ordinaire donne une grille reconnaissable, et un relief mal déclaré une
   * image coupée en deux.
   */
  const refreshPreview = async (item: PendingUpload, opts?: { force?: boolean }) => {
    let locked = false;
    setPending((p) => {
      const current = p.find((it) => it.tempId === item.tempId);
      if (!opts?.force && current?.previewCustom) {
        locked = true;
        return p;
      }
      return p.map((it) => (it.tempId === item.tempId ? { ...it, previewState: "running" } : it));
    });
    if (locked) return;

    const thumbnail = await generateVideoThumbnail(item.file, {
      projection: item.projection,
      stereo: item.stereo_mode === "unknown" ? "mono" : item.stereo_mode,
      sourceLayout: item.source_layout,
    });
    const url = thumbnail ? URL.createObjectURL(thumbnail.blob) : undefined;

    setPending((p) =>
      p.map((it) => {
        if (it.tempId !== item.tempId) {
          return it;
        }
        if (!opts?.force && it.previewCustom) {
          if (url) URL.revokeObjectURL(url);
          return it;
        }
        // Un aperçu plus récent a pu arriver entre-temps, ou l'entrée avoir été retirée :
        // libérer l'ancien lien évite d'accumuler des images en mémoire.
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        return {
          ...it,
          previewUrl: url,
          previewBlob: thumbnail?.blob,
          previewDurationSeconds: thumbnail?.durationSeconds ?? it.previewDurationSeconds,
          previewState: url ? "idle" : "failed",
          previewCustom: opts?.force ? false : it.previewCustom,
        };
      }),
    );
  };

  const applyCustomPendingThumbnail = async (tempId: string, file: File) => {
    const result = await prepareImageThumbnail(file);
    if (!result) {
      toast.error(`Image refusée — JPEG, PNG ou WebP, ${IMAGE_THUMBNAIL_MAX_BYTES / 1024 / 1024} Mo max.`);
      return;
    }
    const url = URL.createObjectURL(result.blob);
    setPending((p) =>
      p.map((it) => {
        if (it.tempId !== tempId) return it;
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        return {
          ...it,
          previewUrl: url,
          previewBlob: result.blob,
          previewState: "idle",
          previewCustom: true,
        };
      }),
    );
  };

  const updatePending = (tempId: string, patch: Partial<PendingUpload>) => {
    // Déplier les réglages n'est pas une correction, et ne change pas l'aperçu : seul un
    // changement de format compte, et régénérer coûte un décodage.
    const changeLeFormat =
      "projection" in patch || "stereo_mode" in patch || "source_layout" in patch;

    let modifie: PendingUpload | null = null;
    setPending((p) =>
      p.map((it) => {
        if (it.tempId !== tempId) return it;
        const merged = { ...it, ...patch };
        if (changeLeFormat) merged.touched = true;
        // Le relief n'a pas de sens sur un écran, et l'encodage sphérique pas davantage.
        if (merged.projection === "flat") {
          merged.stereo_mode = "mono";
          merged.source_layout = "equirectangular";
        }
        modifie = merged;
        return merged;
      }),
    );

    if (modifie && changeLeFormat) refreshPreview(modifie);
  };

  const removePending = (tempId: string) =>
    setPending((p) =>
      p.filter((it) => {
        if (it.tempId !== tempId) return true;
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        return false;
      }),
    );

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
    item: PendingUpload,
    videoPath: string,
    signal: AbortSignal,
  ): Promise<{ path: string | null; durationSeconds: number | null }> => {
    const { file } = item;
    try {
      // L'aperçu affiché dans le formulaire est déjà cette vignette, rendue avec les mêmes
      // réglages : la réutiliser évite de décoder une seconde fois un fichier qui peut peser
      // plusieurs gigaoctets.
      const generated = item.previewBlob
        ? null
        : await generateVideoThumbnail(file, {
            projection: item.projection,
            // Le relief décide de quel œil provient la vignette, l'encodage décide de quelle
            // portion de l'image : sans eux, le cadrage tombe à cheval sur une frontière.
            stereo: item.stereo_mode === "unknown" ? "mono" : item.stereo_mode,
            sourceLayout: item.source_layout,
          });
      const blob = item.previewBlob ?? generated?.blob ?? null;
      const durationSeconds = generated?.durationSeconds ?? item.previewDurationSeconds ?? null;

      if (!blob) {
        console.warn("[thumbnail] génération impossible pour", file.name);
        return { path: null, durationSeconds };
      }

      // Même arborescence que la vidéo, avec l'extension image : le rapprochement entre un objet
      // et sa miniature reste évident depuis la console de stockage.
      const path = `${videoPath.replace(/\.[^./]+$/, "")}.jpg`;

      const { error } = await supabase.storage.from("thumbnails").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (error) {
        console.warn("[thumbnail] envoi impossible :", error.message);
        return { path: null, durationSeconds };
      }

      if (signal.aborted) {
        await supabase.storage.from("thumbnails").remove([path]).catch(() => undefined);
        return { path: null, durationSeconds };
      }

      return { path, durationSeconds };
    } catch (err) {
      console.warn("[thumbnail] échec inattendu :", err);
      return { path: null, durationSeconds: item.previewDurationSeconds ?? null };
    }
  };

  const confirmUpload = async (item: PendingUpload) => {
    // Block inconsistent uploads: stereo projection without known layout
    if (item.projection !== "flat" && item.stereo_mode === "unknown") {
      toast.error("Précisez le mode stéréo (mono / top_bottom / side_by_side) avant d'uploader.");
      return;
    }
    const { tempId, file, projection, stereo_mode, source_layout } = item;
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
      const thumbnail = await uploadThumbnail(item, path, controller.signal);
      thumbnailPath = thumbnail.path;
      const durationSeconds = thumbnail.durationSeconds;
      setUpload(tempId, { phase: "thumbnail", progress: 100 });

      setUpload(tempId, { phase: "saving", progress: 100 });
      const { error: dbErr } = await supabase.from("videos").insert({
        name: file.name,
        library: activeLib,
        format: legacyFormatFor(projection, stereo_mode),
        projection,
        stereo_mode,
        source_layout,
        size_bytes: file.size,
        storage_path: path,
        thumbnail_url: thumbnailPath,
        duration_seconds: durationSeconds != null ? Math.round(durationSeconds) : null,
        sha256,
      });
      if (dbErr) {
        await supabase.storage.from("videos").remove([path]);
        path = null;
        throw new Error(dbErr.message);
      }
      setUpload(tempId, { progress: 100, status: "done", controller: undefined });
      if (thumbnailPath) {
        toast.success(`${file.name} uploadée`);
      } else {
        toast.warning(`${file.name} uploadée, sans miniature`);
      }
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

  const thumbnailFormatOf = (v: Pick<VideoRow, "projection" | "stereo_mode" | "source_layout">) => ({
    projection: v.projection,
    stereo: (v.stereo_mode === "unknown" ? "mono" : v.stereo_mode) as "mono" | "top_bottom" | "side_by_side",
    sourceLayout: v.source_layout,
  });

  const persistThumbnailBlob = async (v: VideoRow, blob: Blob) => {
    const base = v.storage_path.replace(/\.[^./]+$/, "");
    const path = `${base}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    const { error: upErr } = await supabase.storage.from("thumbnails").upload(path, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (upErr) throw new Error(upErr.message);

    const { error: dbErr } = await supabase.from("videos").update({ thumbnail_url: path }).eq("id", v.id);
    if (dbErr) {
      await supabase.storage.from("thumbnails").remove([path]).catch(() => undefined);
      throw new Error(dbErr.message);
    }
    if (v.thumbnail_url && v.thumbnail_url !== path) {
      await supabase.storage.from("thumbnails").remove([v.thumbnail_url]).catch(() => undefined);
    }
    await refresh();
  };

  const handleCustomLibraryThumbnail = async (v: VideoRow, file: File) => {
    setThumbBusy(v.id);
    try {
      const result = await prepareImageThumbnail(file);
      if (!result) {
        toast.error(`Image refusée — JPEG, PNG ou WebP, ${IMAGE_THUMBNAIL_MAX_BYTES / 1024 / 1024} Mo max.`);
        return;
      }
      await persistThumbnailBlob(v, result.blob);
      toast.success("Miniature mise à jour");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Miniature non enregistrée");
    } finally {
      setThumbBusy(null);
    }
  };

  const handleRegenerateLibraryThumbnail = async (v: VideoRow) => {
    setThumbBusy(v.id);
    try {
      const { data, error } = await supabase.storage.from("videos").createSignedUrl(v.storage_path, 3600);
      if (error || !data) throw new Error(error?.message ?? "URL indisponible");
      const result = await generateVideoThumbnail(data.signedUrl, thumbnailFormatOf(v));
      if (!result) {
        toast.error("Extraction impossible — le navigateur ne décode pas cette vidéo.");
        return;
      }
      await persistThumbnailBlob(v, result.blob);
      toast.success("Miniature extraite de la vidéo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Miniature non extraite");
    } finally {
      setThumbBusy(null);
    }
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
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            const target = thumbnailTargetRef.current;
            e.target.value = "";
            thumbnailTargetRef.current = null;
            if (file && target) void handleCustomLibraryThumbnail(target, file);
          }}
        />
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

      {/* Vidéos déposées, en attente de confirmation du format */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">
            {pending.length === 1 ? "Vidéo à envoyer" : `${pending.length} vidéos à envoyer`}
          </p>
          {pending.map((it) => {
            const isFlat = it.projection === "flat";
            const stereoUnknown = !isFlat && it.stereo_mode === "unknown";
            const enCours = it.analysis === "running";
            const projection = PROJECTION_CHOICES.find((c) => c.value === it.projection);
            const stereo = STEREO_CHOICES.find((c) => c.value === it.stereo_mode);
            const layout = SOURCE_LAYOUT_CHOICES.find((c) => c.value === it.source_layout);

            return (
              <div key={it.tempId} className="rounded-lg border border-[hsl(var(--vr-violet)_/_0.4)] bg-[hsl(var(--vr-surface)_/_0.5)] p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <FileVideo size={14} className="text-[hsl(var(--vr-violet))]" />
                  <span className="text-xs font-medium truncate flex-1">{it.file.name}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtSize(it.file.size)}</span>
                </div>

                <div className="flex gap-3">
                  {/* L'aperçu est rendu avec les réglages retenus : c'est lui qui rend une
                      erreur visible sans avoir à mettre le casque. */}
                  <div className="shrink-0 w-32 space-y-1.5">
                    <div className="w-32 aspect-video rounded overflow-hidden bg-background border border-border/60 flex items-center justify-center">
                      {it.previewUrl ? (
                        <img src={it.previewUrl} alt="Aperçu de la vidéo avec les réglages retenus" className="w-full h-full object-cover" />
                      ) : it.previewState === "running" || enCours ? (
                        <Loader2 size={14} className="animate-spin text-muted-foreground/60" />
                      ) : (
                        <span className="text-[9px] text-muted-foreground/60 text-center px-2">
                          Aperçu indisponible
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-[hsl(var(--vr-violet))] hover:underline cursor-pointer">
                        Choisir une image
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void applyCustomPendingThumbnail(it.tempId, file);
                          }}
                        />
                      </label>
                      {it.previewCustom ? (
                        <button
                          type="button"
                          onClick={() => void refreshPreview(it, { force: true })}
                          className="text-[10px] text-muted-foreground hover:text-foreground text-left"
                        >
                          Reprendre une image de la vidéo
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/70">
                          Par défaut : extraite de la vidéo
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    {enCours ? (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin" />
                        Lecture de la vidéo pour reconnaître son format…
                      </p>
                    ) : (
                      <>
                        <p className="text-[11px] flex items-start gap-1.5">
                          {it.recognised ? (
                            <CheckCircle2 size={12} className="text-[hsl(140_70%_55%)] mt-px shrink-0" />
                          ) : (
                            <AlertTriangle size={12} className="text-amber-500 mt-px shrink-0" />
                          )}
                          <span className={it.recognised ? "text-foreground" : "text-amber-500"}>
                            {it.recognised
                              ? "Format reconnu. Vérifie l'aperçu, puis envoie."
                              : "Format à confirmer. Vérifie l'aperçu et les réglages."}
                          </span>
                        </p>
                        <p className="text-[11px] text-foreground/90">
                          {projection?.label}
                          {!isFlat && stereo ? `, ${stereo.label.toLowerCase()}` : ""}
                          {!isFlat && it.source_layout === "equiangular_cubemap" && layout
                            ? `, ${layout.label.toLowerCase()}`
                            : ""}
                        </p>
                        {it.analysisNote && (
                          <p className="text-[10px] text-muted-foreground">{it.analysisNote}</p>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => updatePending(it.tempId, { showSettings: !it.showSettings })}
                      className="text-[10px] text-[hsl(var(--vr-violet))] hover:underline"
                    >
                      {it.showSettings ? "Masquer les réglages" : "Modifier les réglages"}
                    </button>
                  </div>
                </div>

                {it.showSettings && (
                  <div className="space-y-2 pt-1 border-t border-border/40">
                    <label className="block text-[10px] text-muted-foreground space-y-1">
                      <span>Ce que la vidéo montre</span>
                      <select
                        value={it.projection}
                        onChange={(e) => updatePending(it.tempId, { projection: e.target.value as Projection })}
                        className="w-full rounded bg-background border border-border/60 px-2 py-1.5 text-xs text-foreground"
                      >
                        {PROJECTION_CHOICES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <span className="block text-[10px] text-muted-foreground/70">{projection?.hint}</span>
                    </label>

                    <label className="block text-[10px] text-muted-foreground space-y-1">
                      <span>Relief</span>
                      <select
                        value={it.stereo_mode}
                        disabled={isFlat}
                        onChange={(e) => updatePending(it.tempId, { stereo_mode: e.target.value as StereoMode })}
                        className="w-full rounded bg-background border border-border/60 px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                      >
                        {STEREO_CHOICES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <span className="block text-[10px] text-muted-foreground/70">
                        {isFlat ? "Sans objet sur un écran plat." : stereo?.hint}
                      </span>
                    </label>

                    <label className="block text-[10px] text-muted-foreground space-y-1">
                      <span>Encodage de l'image</span>
                      <select
                        value={it.source_layout}
                        disabled={isFlat}
                        onChange={(e) => updatePending(it.tempId, { source_layout: e.target.value as SourceLayout })}
                        className="w-full rounded bg-background border border-border/60 px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                      >
                        {SOURCE_LAYOUT_CHOICES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <span className="block text-[10px] text-muted-foreground/70">
                        {isFlat ? "Sans objet sur un écran plat." : layout?.hint}
                      </span>
                    </label>
                  </div>
                )}

                {stereoUnknown && (
                  <p className="text-[10px] text-amber-500">
                    Précise la disposition des deux yeux avant d'envoyer : superposés ou côte à côte.
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
                    disabled={stereoUnknown || enCours}
                    className="text-[11px] px-3 py-1.5 rounded bg-[hsl(var(--vr-violet))] text-white font-medium hover:bg-[hsl(var(--vr-violet)_/_0.85)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Envoyer
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
          {filtered.map((v) => {
            const durationLabel = fmtDuration(v.duration_seconds);
            return (
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
                  {durationLabel ? `${durationLabel} • ` : ""}
                  {PROJECTION_LABELS[v.projection] ?? v.projection} • {STEREO_LABELS[v.stereo_mode] ?? v.stereo_mode}
                  {/* L'encodage n'est signalé que s'il sort de l'ordinaire : le mentionner à
                      chaque ligne noierait l'information utile. */}
                  {v.source_layout === "equiangular_cubemap" && " • Cubemap"} • {fmtSize(v.size_bytes)} • ajoutée le {new Date(v.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <button
                onClick={() => handleDownload(v)}
                className="p-2 rounded text-muted-foreground hover:text-[hsl(var(--vr-cyan))] hover:bg-[hsl(var(--vr-cyan)_/_0.1)] transition-colors"
                title="Télécharger"
              >
                <Download size={13} />
              </button>
              {canManageContent && (
                <>
                  <button
                    onClick={() => {
                      thumbnailTargetRef.current = v;
                      imageInputRef.current?.click();
                    }}
                    disabled={thumbBusy === v.id}
                    className="p-2 rounded text-muted-foreground hover:text-[hsl(var(--vr-violet))] hover:bg-[hsl(var(--vr-violet)_/_0.1)] transition-colors disabled:opacity-50"
                    title="Choisir une image pour la miniature"
                  >
                    {thumbBusy === v.id ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                  </button>
                  <button
                    onClick={() => void handleRegenerateLibraryThumbnail(v)}
                    disabled={thumbBusy === v.id}
                    className="p-2 rounded text-muted-foreground hover:text-[hsl(var(--vr-violet))] hover:bg-[hsl(var(--vr-violet)_/_0.1)] transition-colors disabled:opacity-50"
                    title="Extraire la miniature depuis la vidéo"
                  >
                    <RotateCcw size={13} />
                  </button>
                </>
              )}
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
            );
          })}
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
