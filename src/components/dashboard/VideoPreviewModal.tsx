import { useState, useEffect, useRef, useCallback } from "react";
import { X, Film, Calendar, Clock, HardDrive, Eye, Play, Pause, Monitor, Copy, Check } from "lucide-react";
import { Video } from "@/store/vrStore";
import { useVRStore } from "@/store/vrStore";
import { cn } from "@/lib/utils";

interface VideoPreviewModalProps {
  video: Video;
  onClose: () => void;
}

const formatBadge: Record<string, string> = {
  "360": "bg-[hsl(var(--vr-violet)_/_0.18)] text-[hsl(var(--vr-violet))] border-[hsl(var(--vr-violet)_/_0.35)]",
  "180": "bg-[hsl(var(--vr-cyan)_/_0.18)] text-[hsl(var(--vr-cyan))] border-[hsl(var(--vr-cyan)_/_0.35)]",
};

const stereoBadge: Record<string, string> = {
  mono: "bg-muted text-muted-foreground border-border",
  sbs: "bg-[hsl(50_80%_50%_/_0.15)] text-[hsl(50_80%_60%)] border-[hsl(50_80%_50%_/_0.3)]",
  ou: "bg-[hsl(200_80%_50%_/_0.15)] text-[hsl(200_80%_65%)] border-[hsl(200_80%_50%_/_0.3)]",
};

const stereoLabel: Record<string, string> = {
  mono: "Monoscopic",
  sbs: "Side-by-Side (3D)",
  ou: "Over-Under (3D)",
};

// Parse "MM:SS" or "H:MM:SS" duration string to total seconds
function parseDuration(dur: string): number {
  if (!dur || dur === "—") return 0;
  const parts = dur.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const resolutionInfo: Record<string, { label: string; detail: string; colorClass: string; iconClass: string }> = {
  "360": {
    label: "4K",
    detail: "3840 × 2160",
    colorClass: "text-[hsl(var(--vr-cyan))]",
    iconClass: "bg-[hsl(var(--vr-cyan)_/_0.1)] border-[hsl(var(--vr-cyan)_/_0.25)]",
  },
  "180": {
    label: "8K",
    detail: "7680 × 4320",
    colorClass: "text-[hsl(var(--vr-violet))]",
    iconClass: "bg-[hsl(var(--vr-violet)_/_0.1)] border-[hsl(var(--vr-violet)_/_0.25)]",
  },
};

export default function VideoPreviewModal({ video, onClose }: VideoPreviewModalProps) {
  const { settings } = useVRStore();
  const totalSecs = parseDuration(video.duration);

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–100
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Copy state
  const [copied, setCopied] = useState(false);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (playing) {
      // Each tick = 300ms, step = (300 / totalMs) * 100
      const totalMs = Math.max(totalSecs * 1000, 1000);
      const step = (300 / totalMs) * 100;
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          const next = prev + step;
          if (next >= 100) {
            // Loop
            return 0;
          }
          return next;
        });
      }, 300);
    } else {
      clearTick();
    }
    return clearTick;
  }, [playing, totalSecs, clearTick]);

  // Cleanup on unmount
  useEffect(() => () => clearTick(), [clearTick]);

  const currentSecs = (progress / 100) * totalSecs;
  const filePath = `${settings.videoStoragePath.replace(/\/$/, "")}/${video.name}`;
  const res = resolutionInfo[video.format];

  const handleCopy = () => {
    navigator.clipboard.writeText(filePath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl border border-[hsl(var(--vr-violet)_/_0.25)] bg-[hsl(var(--vr-surface))] shadow-[0_0_60px_hsl(var(--vr-violet)_/_0.18)] overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Film size={15} className="text-[hsl(var(--vr-violet))] shrink-0" />
            <span className="text-sm font-medium truncate">{video.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {/* Copy path button */}
            <button
              onClick={handleCopy}
              title={filePath}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200",
                copied
                  ? "bg-[hsl(140_70%_40%_/_0.15)] text-[hsl(140_70%_55%)] border-[hsl(140_70%_40%_/_0.35)]"
                  : "bg-muted/50 text-muted-foreground border-border/50 hover:text-foreground hover:bg-muted/80"
              )}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copié !" : "Copier le chemin"}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="relative bg-background/60 border-b border-border/40">
          <div className="aspect-video flex flex-col items-center justify-center gap-3">
            {/* Decorative grid */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "linear-gradient(hsl(var(--vr-violet)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--vr-violet)) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            {/* Format badge overlay */}
            <div className="relative z-10 w-20 h-20 rounded-2xl bg-[hsl(var(--vr-violet)_/_0.1)] border border-[hsl(var(--vr-violet)_/_0.2)] flex items-center justify-center">
              <Film size={32} className="text-[hsl(var(--vr-violet)_/_0.5)]" />
            </div>
            <div className="relative z-10 text-center space-y-1">
              <p className="text-xs text-muted-foreground/70 font-medium">Aperçu non disponible</p>
              <p className="text-[11px] text-muted-foreground/40">
                Connectez le stockage pour lire les vidéos
              </p>
            </div>
            {/* Format pill */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", formatBadge[video.format])}>
                {video.format}°
              </span>
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase", stereoBadge[video.stereo])}>
                {video.stereo}
              </span>
            </div>
          </div>

          {/* Simulated timeline */}
          <div className="px-5 pb-4 pt-2 space-y-2">
            {/* Progress bar */}
            <div
              className="relative h-1.5 rounded-full bg-border/50 cursor-pointer overflow-hidden group"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const pct = ((e.clientX - rect.left) / rect.width) * 100;
                setProgress(Math.min(100, Math.max(0, pct)));
              }}
            >
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-[hsl(var(--vr-violet))] transition-all duration-300"
                style={{
                  width: `${progress}%`,
                  boxShadow: playing ? "0 0 8px hsl(var(--vr-violet) / 0.6)" : "none",
                }}
              />
            </div>
            {/* Controls row */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-[hsl(var(--vr-violet)_/_0.15)] border border-[hsl(var(--vr-violet)_/_0.35)] hover:bg-[hsl(var(--vr-violet)_/_0.25)] transition-colors text-[hsl(var(--vr-violet))]"
              >
                {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              </button>
              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                {formatSeconds(currentSecs)}
                <span className="text-muted-foreground/40 mx-1">/</span>
                {video.duration === "—" ? "—" : video.duration}
              </span>
              {playing && (
                <span className="ml-auto text-[10px] font-medium text-[hsl(var(--vr-violet)_/_0.7)] animate-pulse">
                  ● EN COURS
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="p-5 grid grid-cols-2 gap-3">
          {[
            {
              icon: <Eye size={13} className="text-[hsl(var(--vr-violet))]" />,
              label: "Format",
              value: `${video.format}° — ${video.format === "360" ? "Sphérique" : "Semi-sphérique"}`,
            },
            {
              icon: <Film size={13} className="text-[hsl(var(--vr-cyan))]" />,
              label: "Stéréoscopie",
              value: stereoLabel[video.stereo] ?? video.stereo.toUpperCase(),
            },
            {
              icon: <Clock size={13} className="text-muted-foreground" />,
              label: "Durée",
              value: video.duration === "—" ? "Inconnue" : video.duration,
            },
            {
              icon: <HardDrive size={13} className="text-muted-foreground" />,
              label: "Taille",
              value: `${video.sizeGB.toFixed(2)} GB`,
            },
            {
              icon: (
                <Monitor
                  size={13}
                  className={res.colorClass}
                />
              ),
              label: "Résolution estimée",
              value: `${res.label} — ${res.detail}`,
              valueClass: res.colorClass,
            },
            {
              icon: <Calendar size={13} className="text-muted-foreground" />,
              label: "Ajouté le",
              value: video.addedAt,
            },
          ].map(({ icon, label, value, valueClass }) => (
            <div
              key={label}
              className="rounded-xl bg-background/50 border border-border/40 px-3.5 py-3 space-y-1"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 font-medium">
                {icon}
                {label}
              </div>
              <p className={cn("text-sm font-medium tabular-nums", valueClass)}>{value}</p>
            </div>
          ))}
        </div>

        {/* File path footer */}
        <div className="px-5 pb-5 -mt-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/40 border border-border/30">
            <span className="text-[10px] text-muted-foreground/50 shrink-0 font-mono uppercase tracking-wider">Chemin</span>
            <span className="text-[11px] text-muted-foreground/70 font-mono truncate flex-1">{filePath}</span>
            <button onClick={handleCopy} className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              {copied ? <Check size={11} className="text-[hsl(140_70%_55%)]" /> : <Copy size={11} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
