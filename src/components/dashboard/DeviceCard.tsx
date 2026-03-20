import { Battery, Wifi, Usb, MapPin, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Device } from "@/store/vrStore";

interface DeviceCardProps {
  device: Device;
}

const statusMap = {
  connected: {
    dot: "bg-[hsl(140_70%_55%)]",
    label: "Connecté",
    color: "text-[hsl(140_70%_55%)]",
    border: "border-[hsl(140_70%_55%_/_0.25)]",
    glow: "shadow-[0_0_20px_hsl(140_70%_55%_/_0.12)]",
  },
  disconnected: {
    dot: "bg-muted-foreground/40",
    label: "Déconnecté",
    color: "text-muted-foreground",
    border: "border-border/50",
    glow: "",
  },
  syncing: {
    dot: "bg-[hsl(var(--vr-cyan))] animate-pulse-glow",
    label: "Sync en cours…",
    color: "text-[hsl(var(--vr-cyan))]",
    border: "border-[hsl(var(--vr-cyan)_/_0.3)]",
    glow: "shadow-[0_0_20px_hsl(var(--vr-cyan)_/_0.15)]",
  },
};

export default function DeviceCard({ device }: DeviceCardProps) {
  const s = statusMap[device.status];
  const storagePercent = Math.round((device.storageUsedGB / device.storageTotalGB) * 100);

  return (
    <div className={cn(
      "rounded-xl border bg-[hsl(var(--vr-surface))] p-5 flex flex-col gap-4 transition-all duration-300",
      s.border, s.glow
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sm text-foreground">{device.name}</p>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">{device.serial}</p>
        </div>
        <div className={cn("flex items-center gap-1.5 text-xs font-medium shrink-0", s.color)}>
          <span className={cn("w-2 h-2 rounded-full", s.dot)} />
          {s.label}
        </div>
      </div>

      {/* Type badge */}
      <div className="flex items-center gap-2">
        {device.type === "location" ? (
          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[hsl(var(--vr-violet)_/_0.12)] text-[hsl(var(--vr-violet))] border border-[hsl(var(--vr-violet)_/_0.25)]">
            <MapPin size={11} /> Location
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[hsl(var(--vr-cyan)_/_0.12)] text-[hsl(var(--vr-cyan))] border border-[hsl(var(--vr-cyan)_/_0.25)]">
            <Clapperboard size={11} /> Animations
          </span>
        )}
        {device.ipAddress && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <Wifi size={10} /> {device.ipAddress}
          </span>
        )}
        {!device.ipAddress && device.status === "connected" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Usb size={10} /> USB
          </span>
        )}
      </div>

      {/* Storage */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>Stockage</span>
          <span className="font-mono">{device.storageUsedGB.toFixed(1)} / {device.storageTotalGB} GB</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              storagePercent > 80 ? "bg-[hsl(0_70%_55%)]" : storagePercent > 50 ? "bg-[hsl(var(--vr-cyan))]" : "bg-[hsl(var(--vr-violet))]"
            )}
            style={{ width: `${storagePercent}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1">{storagePercent}% utilisé</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        {device.status === "connected" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Battery size={12} /> {device.battery}%
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {device.lastSyncAt
            ? `Sync: ${new Date(device.lastSyncAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : "Jamais synchronisé"}
        </span>
      </div>
    </div>
  );
}
