import { Trash2, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { Video } from "@/store/vrStore";

interface VideoRowProps {
  video: Video;
  onRemove?: () => void;
}

const formatBadge = {
  "360": "bg-[hsl(var(--vr-violet)_/_0.18)] text-[hsl(var(--vr-violet))] border-[hsl(var(--vr-violet)_/_0.35)]",
  "180": "bg-[hsl(var(--vr-cyan)_/_0.18)] text-[hsl(var(--vr-cyan))] border-[hsl(var(--vr-cyan)_/_0.35)]",
};

const stereoBadge = {
  mono: "bg-muted text-muted-foreground border-border",
  sbs: "bg-[hsl(50_80%_50%_/_0.15)] text-[hsl(50_80%_60%)] border-[hsl(50_80%_50%_/_0.3)]",
  ou: "bg-[hsl(200_80%_50%_/_0.15)] text-[hsl(200_80%_65%)] border-[hsl(200_80%_50%_/_0.3)]",
};

export default function VideoRow({ video, onRemove }: VideoRowProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background/40 border border-border/40 hover:border-border hover:bg-muted/30 transition-all duration-200 group">
      <Film size={14} className="text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm text-foreground/90 truncate font-mono text-[13px]">{video.name}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold border", formatBadge[video.format])}>
          {video.format}°
        </span>
        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase", stereoBadge[video.stereo])}>
          {video.stereo}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono ml-1">{video.sizeGB.toFixed(1)} GB</span>
        <span className="text-[11px] text-muted-foreground/60 font-mono">{video.duration}</span>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all duration-150 ml-1"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
