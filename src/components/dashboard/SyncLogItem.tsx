import { CheckCircle2, XCircle, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncLog } from "@/store/vrStore";
import { useState } from "react";

interface SyncLogItemProps {
  log: SyncLog;
}

const statusIcons = {
  success: <CheckCircle2 size={15} className="text-[hsl(140_70%_55%)] shrink-0" />,
  error: <XCircle size={15} className="text-destructive shrink-0" />,
  running: <Loader2 size={15} className="text-[hsl(var(--vr-cyan))] animate-spin shrink-0" />,
};

const libraryLabel = { location: "Location", animations: "Animations" };

export default function SyncLogItem({ log }: SyncLogItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "rounded-lg border transition-all",
      log.status === "success" ? "border-[hsl(140_70%_55%_/_0.2)] bg-[hsl(140_70%_55%_/_0.04)]" :
      log.status === "error" ? "border-destructive/20 bg-destructive/5" :
      "border-[hsl(var(--vr-cyan)_/_0.25)] bg-[hsl(var(--vr-cyan)_/_0.05)]"
    )}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {statusIcons[log.status]}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              Sync {libraryLabel[log.library]}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {new Date(log.at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {log.videosPushed} envoyé(s) · {log.videosSkipped} ignoré(s) · {log.deviceIds.length} casque(s)
          </p>
        </div>
        <ChevronDown size={14} className={cn("text-muted-foreground transition-transform shrink-0", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-border/40">
          <div className="mt-3 rounded-lg bg-background/60 p-3 font-mono text-[11px] text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
            {log.lines.map((line, i) => (
              <p key={i} className={cn(
                line.includes("✓") ? "text-[hsl(140_70%_55%)]" :
                line.includes("Erreur") ? "text-destructive" :
                line.includes("Skip") ? "text-muted-foreground/60" :
                "text-foreground/80"
              )}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
