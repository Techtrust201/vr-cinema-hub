import { Battery, Wifi, Usb, MapPin, Clapperboard, Pencil, Trash2, Check, X, Signal, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Device, LibraryType } from "@/store/vrStore";
import { useState } from "react";

interface DeviceCardProps {
  device: Device;
  onUpdate?: (updates: Partial<Device>) => void;
  onRemove?: () => void;
  onPrepareWifi?: () => Promise<void>;
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

export default function DeviceCard({ device, onUpdate, onRemove, onPrepareWifi }: DeviceCardProps) {
  const s = statusMap[device.status];
  const storagePercent = Math.round((device.storageUsedGB / device.storageTotalGB) * 100);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(device.name);
  const [preparingWifi, setPreparingWifi] = useState(false);

  const handlePrepareWifi = async () => {
    if (!onPrepareWifi) return;
    setPreparingWifi(true);
    try {
      await onPrepareWifi();
    } finally {
      setPreparingWifi(false);
    }
  };

  const commitName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== device.name) onUpdate?.({ name: trimmed });
    else setNameValue(device.name);
    setEditingName(false);
  };

  const toggleType = () => {
    const next: LibraryType = device.type === "location" ? "animations" : "location";
    onUpdate?.({ type: next });
  };

  return (
    <div className={cn(
      "rounded-xl border bg-[hsl(var(--vr-surface))] p-5 flex flex-col gap-4 transition-all duration-300 group",
      s.border, s.glow
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setNameValue(device.name); setEditingName(false); } }}
                className="flex-1 min-w-0 px-2 py-0.5 text-sm font-semibold rounded border border-[hsl(var(--vr-violet)_/_0.5)] bg-background focus:outline-none"
              />
              <button onClick={commitName} className="p-1 text-[hsl(140_70%_55%)] hover:bg-muted/50 rounded"><Check size={12} /></button>
              <button onClick={() => { setNameValue(device.name); setEditingName(false); }} className="p-1 text-muted-foreground hover:bg-muted/50 rounded"><X size={12} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group/name">
              <p className="font-semibold text-sm text-foreground truncate">{device.name}</p>
              {onUpdate && (
                <button
                  onClick={() => setEditingName(true)}
                  className="opacity-0 group-hover/name:opacity-100 p-0.5 rounded text-muted-foreground/50 hover:text-[hsl(var(--vr-violet))] transition-all"
                >
                  <Pencil size={11} />
                </button>
              )}
            </div>
          )}
          <p className="text-xs font-mono text-muted-foreground mt-0.5">{device.serial}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className={cn("flex items-center gap-1.5 text-xs font-medium", s.color)}>
            <span className={cn("w-2 h-2 rounded-full", s.dot)} />
            {s.label}
          </div>
          {onRemove && (
            <button
              onClick={onRemove}
              className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Type badge — clickable to toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={onUpdate ? toggleType : undefined}
          className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all",
            onUpdate && "hover:opacity-80 active:scale-95",
            device.type === "location"
              ? "bg-[hsl(var(--vr-violet)_/_0.12)] text-[hsl(var(--vr-violet))] border-[hsl(var(--vr-violet)_/_0.25)]"
              : "bg-[hsl(var(--vr-cyan)_/_0.12)] text-[hsl(var(--vr-cyan))] border-[hsl(var(--vr-cyan)_/_0.25)]"
          )}
        >
          {device.type === "location" ? <MapPin size={11} /> : <Clapperboard size={11} />}
          {device.type === "location" ? "Location" : "Animations"}
          {onUpdate && <span className="opacity-40 ml-0.5 text-[9px]">▼</span>}
        </button>
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
