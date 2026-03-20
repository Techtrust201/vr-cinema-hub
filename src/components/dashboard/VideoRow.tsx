import { Trash2, Film, ChevronDown, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Video, VideoFormat, StereoMode } from "@/store/vrStore";
import { useState, useRef, useEffect } from "react";

interface VideoRowProps {
  video: Video;
  onRemove?: () => void;
  onUpdate?: (updates: Partial<Pick<Video, "format" | "stereo">>) => void;
  onPreview?: () => void;
}

const formatBadge: Record<VideoFormat, string> = {
  "360": "bg-[hsl(var(--vr-violet)_/_0.18)] text-[hsl(var(--vr-violet))] border-[hsl(var(--vr-violet)_/_0.35)]",
  "180": "bg-[hsl(var(--vr-cyan)_/_0.18)] text-[hsl(var(--vr-cyan))] border-[hsl(var(--vr-cyan)_/_0.35)]",
};

const stereoBadge: Record<StereoMode, string> = {
  mono: "bg-muted text-muted-foreground border-border",
  sbs: "bg-[hsl(50_80%_50%_/_0.15)] text-[hsl(50_80%_60%)] border-[hsl(50_80%_50%_/_0.3)]",
  ou: "bg-[hsl(200_80%_50%_/_0.15)] text-[hsl(200_80%_65%)] border-[hsl(200_80%_50%_/_0.3)]",
};

function InlineDropdown({ children, trigger }: { children: React.ReactNode; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[110px] rounded-lg border border-border/70 bg-[hsl(var(--vr-surface))] shadow-xl py-1 overflow-hidden"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropItem({ onClick, children, active }: { onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted/60",
        active ? "text-[hsl(var(--vr-violet))]" : "text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

export default function VideoRow({ video, onRemove, onUpdate, onPreview }: VideoRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background/40 border border-border/40 hover:border-border hover:bg-muted/30 transition-all duration-200 group",
        onPreview && "cursor-pointer"
      )}
      onClick={onPreview}
    >
      <Film size={14} className="text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm text-foreground/90 truncate font-mono text-[13px]">{video.name}</span>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Format badge */}
        {onUpdate ? (
          <InlineDropdown
            trigger={
              <button className={cn("flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer hover:opacity-80 transition-opacity", formatBadge[video.format])}>
                {video.format}° <ChevronDown size={8} />
              </button>
            }
          >
            {(["360", "180"] as VideoFormat[]).map((f) => (
              <DropItem key={f} onClick={() => onUpdate({ format: f })} active={video.format === f}>
                {f}° {video.format === f && "✓"}
              </DropItem>
            ))}
          </InlineDropdown>
        ) : (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold border", formatBadge[video.format])}>
            {video.format}°
          </span>
        )}

        {/* Stereo badge */}
        {onUpdate ? (
          <InlineDropdown
            trigger={
              <button className={cn("flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase cursor-pointer hover:opacity-80 transition-opacity", stereoBadge[video.stereo])}>
                {video.stereo} <ChevronDown size={8} />
              </button>
            }
          >
            {(["mono", "sbs", "ou"] as StereoMode[]).map((s) => (
              <DropItem key={s} onClick={() => onUpdate({ stereo: s })} active={video.stereo === s}>
                {s.toUpperCase()} {video.stereo === s && "✓"}
              </DropItem>
            ))}
          </InlineDropdown>
        ) : (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase", stereoBadge[video.stereo])}>
            {video.stereo}
          </span>
        )}

        <span className="text-[11px] text-muted-foreground font-mono ml-1">{video.sizeGB.toFixed(1)} GB</span>
        <span className="text-[11px] text-muted-foreground/60 font-mono">{video.duration}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150 ml-1" onClick={(e) => e.stopPropagation()}>
        {onPreview && (
          <button
            onClick={onPreview}
            className="p-1 rounded text-muted-foreground hover:text-[hsl(var(--vr-cyan))] transition-colors"
          >
            <Eye size={13} />
          </button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
