import { X, Film, Calendar, Clock, HardDrive, Eye } from "lucide-react";
import { Video } from "@/store/vrStore";
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

export default function VideoPreviewModal({ video, onClose }: VideoPreviewModalProps) {
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
          <div className="flex items-center gap-2.5 min-w-0">
            <Film size={15} className="text-[hsl(var(--vr-violet))] shrink-0" />
            <span className="text-sm font-medium truncate">{video.name}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors shrink-0 ml-2"
          >
            <X size={15} />
          </button>
        </div>

        {/* Preview area */}
        <div className="relative bg-background/60 border-b border-border/40 aspect-video flex flex-col items-center justify-center gap-3">
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
              icon: <Calendar size={13} className="text-muted-foreground" />,
              label: "Ajouté le",
              value: video.addedAt,
              colSpan: true,
            },
          ].map(({ icon, label, value, colSpan }) => (
            <div
              key={label}
              className={cn(
                "rounded-xl bg-background/50 border border-border/40 px-3.5 py-3 space-y-1",
                colSpan && "col-span-2"
              )}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 font-medium">
                {icon}
                {label}
              </div>
              <p className="text-sm font-medium tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
