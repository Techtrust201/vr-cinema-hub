import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveData } from "@/hooks/useLiveData";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";
import {
  Upload, MapPin, Clapperboard, FolderOpen, Trash2, Loader2,
  FileVideo, Download, CheckCircle2, XCircle, Play, X, WifiOff, AlertTriangle,
  ImagePlus, RotateCcw, SlidersHorizontal, Info,
} from "lucide-react";
import { toast } from "sonner";
import { isMovLike, resolveVideoContentType, sanitizeStorageFileName } from "@/lib/videoMime";
import { sha256HexOfBlob } from "@/lib/sha256";
import { uploadFileWithProgress } from "@/lib/uploadWithProgress";
import {
  deleteFromObjectStore,
  NoObjectStoreError,
  objectStorePlaybackUrl,
  uploadToObjectStore,
  type ObjectOrigin,
} from "@/lib/objectStore";
import { generateVideoThumbnail, prepareImageThumbnail, IMAGE_THUMBNAIL_MAX_BYTES } from "@/lib/videoThumbnail";
import { detectVideoFormat, type DetectedFormat } from "@/lib/detectVideoFormat";
import { probeVideoFile, sharpnessAdvice, type VideoProbe } from "@/lib/probeVideoFile";
import {
  inferFormatFromFilename,
  shouldAutoSend,
  type InferredFormatFromName,
} from "@/lib/inferVideoFormatFromName";

/**
 * Prévient qu'un fichier est resté dans le stockage sans film associé.
 *
 * Ces nettoyages échouaient en silence : un film de plusieurs centaines de mégaoctets
 * pouvait continuer d'occuper l'espace payant sans apparaître nulle part dans
 * l'application, donc sans que personne puisse le retrouver pour l'effacer.
 */
function warnOrphan(path: string) {
  console.warn("[stockage] fichier orphelin non supprimé :", path);
  toast.warning(
    "Un fichier n'a pas pu être effacé du stockage et occupe encore de l'espace.",
    { description: path, duration: 10000 },
  );
}

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
  origin?: "supabase" | ObjectOrigin;
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
   * Compatibilité du codec avec le casque, établie avant l'envoi. Un format que
   * le casque ne décode pas donnerait un écran noir sans aucun message : on le
   * dit ici, tant que le fichier n'a pas encore traversé le réseau.
   */
  probe?: VideoProbe;
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

function applyFormatAnalysis(
  it: PendingUpload,
  hinted: InferredFormatFromName,
  detected: DetectedFormat | null,
): PendingUpload {
  const skyboxNote =
    "Réglages lus dans le nom du fichier (export Skybox). Le casque n'a pas besoin que le navigateur décode la vidéo.";

  const merged: PendingUpload = it.touched
    ? {
        ...it,
        analysis: "done",
        recognised: false,
        analysisNote: detected?.explanation ?? skyboxNote,
      }
    : {
        ...it,
        projection: detected?.confident ? detected.projection : hinted.projection,
        stereo_mode: detected?.confident ? detected.stereoMode : hinted.stereoMode,
        source_layout: detected?.confident ? detected.sourceLayout : hinted.sourceLayout,
        analysis: "done",
        recognised: Boolean(detected?.confident) || hinted.named,
        analysisNote: detected?.confident
          ? detected.explanation
          : hinted.named
            ? skyboxNote
            : detected?.explanation,
      };

  if (merged.projection === "flat") {
    merged.stereo_mode = "mono";
    merged.source_layout = "equirectangular";
  }
  return merged;
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
      // Les films hors bucket Storage rangent leur miniature dans leur propre
      // origine : il faut la signer là-bas, pas dans le bucket `thumbnails`.
      const external = videos.filter(
        (v) => (v.origin === "disk" || v.origin === "r2") && v.thumbnail_url && !urls[v.thumbnail_url],
      );
      const storagePaths = paths.filter((path) => !urls[path] && !external.some((v) => v.thumbnail_url === path));
      const next: Record<string, string> = {};

      await Promise.all(external.map(async (v) => {
        try {
          next[v.thumbnail_url!] = await objectStorePlaybackUrl(v.thumbnail_url!, v.origin as ObjectOrigin);
        } catch {
          // Stockage injoignable : la carte reste sans image, comme avant.
        }
      }));

      if (storagePaths.length > 0) {
        const { data, error } = await supabase.storage
          .from("thumbnails")
          .createSignedUrls(storagePaths, THUMBNAIL_URL_TTL_SECONDS);
        if (!error && data) {
          for (const entry of data) {
            if (entry.path && entry.signedUrl) next[entry.path] = entry.signedUrl;
          }
        }
      }

      if (cancelled || Object.keys(next).length === 0) return;
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
  const { canManageContent, user } = useAuth();
  const [activeLib, setActiveLib] = useState<LibraryType>("location");
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const fileRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const thumbnailTargetRef = useRef<VideoRow | null>(null);
  const [thumbBusy, setThumbBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ video: VideoRow; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [formatEdit, setFormatEdit] = useState<
    { id: string; projection: Projection; stereo_mode: StereoMode; source_layout: SourceLayout } | null
  >(null);
  const [formatSaving, setFormatSaving] = useState(false);
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

  const uploadInProgress = Object.values(uploads).some((u) => u.status === "uploading");

  /**
   * Prévient avant de quitter la page pendant un envoi.
   *
   * Un envoi vers le stockage objet ne sait pas reprendre où il s'est arrêté : fermer
   * l'onglet à mi-parcours perd la totalité du transfert, soit plusieurs gigaoctets et
   * de longues minutes pour un film. Le navigateur n'affiche cet avertissement que si
   * l'utilisateur a interagi avec la page, ce qui est toujours le cas ici puisqu'il a
   * lancé l'envoi lui-même.
   */
  useEffect(() => {
    if (!uploadInProgress) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadInProgress]);

  const handleFiles = (files: FileList | null) => {
    if (!files || !canManageContent) return;

    // Le sélecteur de fichiers filtre déjà sur les vidéos, mais un glisser-déposer accepte
    // n'importe quoi. Sans ce tri, un document déposé par mégarde partait dans la file
    // d'attente et n'échouait qu'à la toute fin de l'envoi.
    const chosen = Array.from(files);
    const accepted = chosen.filter((file) => resolveVideoContentType(file).startsWith("video/"));
    const rejected = chosen.filter((file) => !accepted.includes(file));
    if (rejected.length > 0) {
      const names = rejected.map((f) => f.name).join(", ");
      toast.error(
        rejected.length === 1
          ? `${names} n'est pas une vidéo. Formats acceptés : MP4, MOV, M4V.`
          : `Ces fichiers ne sont pas des vidéos : ${names}. Formats acceptés : MP4, MOV, M4V.`,
      );
    }
    if (accepted.length === 0) return;

    // Même nom et même taille : c'est le même film renvoyé par mégarde. On prévient sans
    // bloquer, car remplacer un film par une version réencodée est un geste légitime.
    const duplicates = accepted.filter((file) =>
      videos.some((v) => v.library === activeLib && v.name === file.name && v.size_bytes === file.size),
    );
    if (duplicates.length > 0) {
      toast.warning(
        duplicates.length === 1
          ? `« ${duplicates[0].name} » est déjà dans cette bibliothèque. L'envoyer créera un doublon.`
          : `${duplicates.length} de ces films sont déjà dans cette bibliothèque. Les envoyer créera des doublons.`,
      );
    }

    const next: PendingUpload[] = accepted.map((file) => {
      const hinted = inferFormatFromFilename(file.name);
      return {
        tempId: `up-${Date.now()}-${Math.random()}`,
        file,
        projection: hinted.projection,
        stereo_mode: hinted.stereoMode,
        source_layout: hinted.sourceLayout,
        analysis: "running" as const,
        previewState: "idle" as const,
      };
    });
    setPending((p) => {
      const all = [...p, ...next];
      pendingRef.current = all;
      return all;
    });
    // Un film 8K + trois 4K en parallèle gèlent l'onglet : on les traite l'un après l'autre.
    void next.reduce((chain, item) => chain.then(() => analysePending(item)), Promise.resolve());
  };

  /**
   * Propose le format, puis envoie dès qu'il est connu.
   *
   * Un export Skybox porte déjà les réglages dans le nom : on n'attend pas le décodeur
   * du navigateur (HEVC, VP9 4K, 8K). Sans nom exploitable, on examine quelques images.
   */
  const analysePending = async (item: PendingUpload) => {
    // Le codec d'abord : inutile de deviner la projection d'un fichier que le
    // casque ne saura pas ouvrir. Quelques kilo-octets d'en-tête suffisent.
    const probe = await probeVideoFile(item.file);

    const hinted = inferFormatFromFilename(item.file.name);
    const detected = shouldAutoSend(hinted)
      ? null
      : await detectVideoFormat(item.file);
    // Ne pas lire le résultat de setState : hors handler d'événement l'updater
    // n'est pas synchrone, et l'envoi automatique ne partait jamais.
    const current = pendingRef.current.find((it) => it.tempId === item.tempId) ?? item;
    const formatted = applyFormatAnalysis(current, hinted, detected);
    // La netteté ne se juge qu'une fois la projection connue : les mêmes pixels
    // étalés sur 360° ou sur un écran plat ne donnent pas du tout le même rendu.
    const sharpness = sharpnessAdvice(probe.width, formatted.projection) ?? undefined;
    const pret = { ...formatted, probe: { ...probe, sharpness } };
    setPending((p) => p.map((it) => (it.tempId === item.tempId ? pret : it)));
    pendingRef.current = pendingRef.current.map((it) => (it.tempId === item.tempId ? pret : it));

    if (probe.verdict === "unsupported") {
      // Envoi retenu : transférer le fichier ne ferait que déplacer la panne
      // jusqu'au casque, où elle serait bien plus difficile à comprendre.
      toast.error(probe.message);
      return;
    }
    if (probe.verdict === "risky") toast.warning(probe.message);
    else if (sharpness) toast.warning(sharpness.message);

    const stereoOk = pret.projection === "flat" || pret.stereo_mode !== "unknown";
    if (!pret.touched && stereoOk && (detected?.confident || hinted.named)) {
      // Miniature après l'envoi (confirmUpload) : ne pas décoder 8K/HEVC avant le TUS.
      toast.message(`Envoi de ${pret.file.name}…`);
      await confirmUpload(pret);
      return;
    }

    await refreshPreview(pret);
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

  /**
   * Corrige les réglages d'affichage d'un film déjà envoyé.
   *
   * Ces réglages sont déduits du nom du fichier au moment de l'envoi. Quand la déduction se
   * trompe, le film s'affiche déformé, voire pas du tout, et il fallait jusqu'ici le supprimer
   * puis le renvoyer en entier — plusieurs gigaoctets pour une erreur qui ne tient qu'à trois
   * champs.
   */
  const saveFormat = async () => {
    if (!formatEdit) return;
    setFormatSaving(true);
    try {
      const { projection, stereo_mode, source_layout } = formatEdit;
      const { error } = await supabase
        .from("videos")
        .update({
          projection,
          stereo_mode,
          source_layout,
          // Le casque choisit sa surface d'affichage d'après `format` : ne pas le recalculer
          // laisserait la correction sans effet visible dans le casque.
          format: legacyFormatFor(projection, stereo_mode),
        })
        .eq("id", formatEdit.id);
      if (error) throw new Error(error.message);
      await refresh();
      setFormatEdit(null);
      toast.success("Réglages corrigés. Les casques les appliqueront à la prochaine synchronisation.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La correction n'a pas pu être enregistrée.");
    } finally {
      setFormatSaving(false);
    }
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
      // Un 8K dans l'onglet après l'envoi peut encore faire tomber Chrome : au-delà d'un
      // gros fichier, la vignette se choisit plus tard depuis la bibliothèque.
      const tooHeavyForBrowser = !item.previewBlob && file.size >= 700 * 1024 * 1024;
      const generated = item.previewBlob || tooHeavyForBrowser
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
    let origin: ObjectOrigin | "supabase" = "supabase";
    try {
      const contentType = resolveVideoContentType(file);
      if (!contentType.startsWith("video/")) {
        throw new Error(
          `Type MIME non supporté (${file.type || "inconnu"}). Utilisez MP4, MOV, M4V, WebM ou MKV.`,
        );
      }
      if (isMovLike(file)) {
        toast.message(
          "Aperçu navigateur parfois impossible en HEVC — le Quest 3 lit ce format. L'envoi continue.",
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
      const onProgress = (fraction: number) =>
        setUpload(tempId, { phase: "uploading", progress: Math.round(fraction * 100) });

      // C'est le serveur qui sait quel stockage est en service ; le bucket Storage
      // n'est qu'un recours quand aucun n'est configuré, et il plafonne à 50 Mo.
      try {
        origin = await uploadToObjectStore({ path, file, contentType, onProgress, signal: controller.signal });
      } catch (err) {
        if (!(err instanceof NoObjectStoreError)) throw err;
        await uploadFileWithProgress({
          bucket: "videos",
          path,
          file,
          contentType,
          onProgress,
          signal: controller.signal,
        });
        origin = "supabase";
      }

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
        origin,
        thumbnail_url: thumbnailPath,
        duration_seconds: durationSeconds != null ? Math.round(durationSeconds) : null,
        sha256,
        // La colonne existait mais restait vide : impossible de savoir qui avait envoyé
        // un film quand plusieurs personnes gèrent la bibliothèque.
        uploaded_by: user?.id ?? null,
      });
      if (dbErr) {
        if (origin === "supabase") {
          await supabase.storage.from("videos").remove([path]);
        } else {
          await deleteFromObjectStore(path, origin).catch(() => warnOrphan(path!));
        }
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
        if (origin === "supabase") {
          await supabase.storage.from("videos").remove([path]).catch(() => warnOrphan(path!));
        } else {
          await deleteFromObjectStore(path, origin).catch(() => warnOrphan(path!));
        }
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
    const external = v.origin === "disk" || v.origin === "r2";

    if (v.thumbnail_url) {
      // Une miniature orpheline n'occupe que quelques kilo-octets : son échec de suppression ne
      // mérite pas d'alerter l'utilisateur.
      if (external) {
        await deleteFromObjectStore(v.thumbnail_url, v.origin as ObjectOrigin).catch(() => undefined);
      } else {
        await supabase.storage.from("thumbnails").remove([v.thumbnail_url]).catch(() => undefined);
      }
    }

    // Un film pèse près d'un gigaoctet : le laisser derrière soi remplirait le
    // stockage sans que personne ne s'en aperçoive.
    if (external) {
      try {
        await deleteFromObjectStore(v.storage_path, v.origin as ObjectOrigin);
      } catch (err) {
        toast.warning(
          `Vidéo supprimée, mais le fichier stocké subsiste : ${err instanceof Error ? err.message : "erreur"}`,
        );
        return;
      }
    } else {
      const { error: stErr } = await supabase.storage.from("videos").remove([v.storage_path]);
      if (stErr && !stErr.message.includes("not found")) {
        toast.warning(`Vidéo supprimée, mais le fichier stocké subsiste : ${stErr.message}`);
        return;
      }
    }
    toast.success("Vidéo supprimée");
  };

  const signedPlaybackUrl = async (v: VideoRow): Promise<string> => {
    if (v.origin === "disk" || v.origin === "r2") {
      return objectStorePlaybackUrl(v.storage_path, v.origin as ObjectOrigin);
    }
    const { data, error } = await supabase.storage
      .from("videos")
      .createSignedUrl(v.storage_path, 3600);
    if (error || !data?.signedUrl) throw new Error(error?.message ?? "URL indisponible");
    return data.signedUrl;
  };

  const handleDownload = async (v: VideoRow) => {
    try {
      window.open(await signedPlaybackUrl(v), "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "URL indisponible");
    }
  };

  const handlePreview = async (v: VideoRow) => {
    setPreviewLoading(v.id);
    try {
      const url = await signedPlaybackUrl(v);
      setPreview({ video: v, url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "URL indisponible");
    } finally {
      setPreviewLoading(null);
    }
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
      const url = await signedPlaybackUrl(v);
      const result = await generateVideoThumbnail(url, thumbnailFormatOf(v));
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
          {uploadInProgress && (
            <p className="text-[10px] text-amber-500">
              Laissez cette page ouverte jusqu'à la fin : un envoi interrompu doit être
              recommencé depuis le début.
            </p>
          )}
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
            const formatIncompatible = it.probe?.verdict === "unsupported";
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

                {it.probe && it.probe.verdict !== "ok" && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2 flex items-start gap-2",
                      formatIncompatible
                        ? "border-destructive/40 bg-destructive/10"
                        : "border-amber-500/40 bg-amber-500/10",
                    )}
                  >
                    {formatIncompatible ? (
                      <XCircle size={14} className="mt-0.5 shrink-0 text-destructive" />
                    ) : (
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium">{it.probe.message}</p>
                      {it.probe.advice && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{it.probe.advice}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Séparé du verdict : le film se lira sans défaut, il sera seulement
                    moins net. C'est une information, pas un obstacle à l'envoi. */}
                {it.probe?.sharpness && (
                  <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 flex items-start gap-2">
                    <Info size={14} className="mt-0.5 shrink-0 text-sky-500" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium">{it.probe.sharpness.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {it.probe.sharpness.advice}
                      </p>
                    </div>
                  </div>
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
                    disabled={stereoUnknown || enCours || formatIncompatible}
                    title={formatIncompatible ? it.probe?.advice : undefined}
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
            {" "}• format Skybox lu tout seul, envoi automatique
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
            <div key={v.id} className="rounded-lg border border-border/60 bg-[hsl(var(--vr-surface)_/_0.5)] hover:border-[hsl(var(--vr-violet)_/_0.4)] transition-colors">
              <div className="flex items-center gap-3 px-4 py-3">
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
                    onClick={() =>
                      setFormatEdit((f) =>
                        f?.id === v.id
                          ? null
                          : {
                              id: v.id,
                              projection: v.projection,
                              stereo_mode: v.stereo_mode,
                              source_layout: v.source_layout,
                            },
                      )
                    }
                    className={cn(
                      "p-2 rounded transition-colors hover:bg-[hsl(var(--vr-violet)_/_0.1)]",
                      formatEdit?.id === v.id
                        ? "text-[hsl(var(--vr-violet))]"
                        : "text-muted-foreground hover:text-[hsl(var(--vr-violet))]",
                    )}
                    title="Corriger les réglages d'affichage"
                  >
                    <SlidersHorizontal size={13} />
                  </button>
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

              {formatEdit?.id === v.id && (
                <div className="border-t border-border/40 px-4 py-3 space-y-3">
                  <p className="text-[10px] text-muted-foreground">
                    Ces réglages décrivent ce que contient le fichier. S'ils ne lui correspondent
                    pas, l'image apparaîtra déformée ou dédoublée dans le casque.
                  </p>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block text-[10px] text-muted-foreground space-y-1">
                      <span>Ce que la vidéo montre</span>
                      <select
                        value={formatEdit.projection}
                        onChange={(e) => {
                          const projection = e.target.value as Projection;
                          setFormatEdit((f) => f && {
                            ...f,
                            projection,
                            // Un écran plat n'a ni relief ni projection sphérique : garder
                            // d'anciennes valeurs ici laisserait des réglages contradictoires.
                            ...(projection === "flat"
                              ? { stereo_mode: "mono" as StereoMode, source_layout: "equirectangular" as SourceLayout }
                              : {}),
                          });
                        }}
                        className="w-full rounded bg-background border border-border/60 px-2 py-1.5 text-xs text-foreground"
                      >
                        {PROJECTION_CHOICES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[10px] text-muted-foreground space-y-1">
                      <span>Relief</span>
                      <select
                        value={formatEdit.stereo_mode}
                        disabled={formatEdit.projection === "flat"}
                        onChange={(e) => setFormatEdit((f) => f && { ...f, stereo_mode: e.target.value as StereoMode })}
                        className="w-full rounded bg-background border border-border/60 px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                      >
                        {STEREO_CHOICES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-[10px] text-muted-foreground space-y-1">
                      <span>Encodage de l'image</span>
                      <select
                        value={formatEdit.source_layout}
                        disabled={formatEdit.projection === "flat"}
                        onChange={(e) => setFormatEdit((f) => f && { ...f, source_layout: e.target.value as SourceLayout })}
                        className="w-full rounded bg-background border border-border/60 px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
                      >
                        {SOURCE_LAYOUT_CHOICES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void saveFormat()}
                      disabled={formatSaving || formatEdit.stereo_mode === "unknown"}
                      className="rounded bg-[hsl(var(--vr-violet))] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {formatSaving ? "Enregistrement…" : "Enregistrer"}
                    </button>
                    <button
                      onClick={() => setFormatEdit(null)}
                      disabled={formatSaving}
                      className="rounded border border-border/60 px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-50"
                    >
                      Annuler
                    </button>
                    {formatEdit.stereo_mode === "unknown" && (
                      <span className="text-[10px] text-amber-500">
                        Précisez la disposition du relief avant d'enregistrer.
                      </span>
                    )}
                  </div>
                </div>
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
