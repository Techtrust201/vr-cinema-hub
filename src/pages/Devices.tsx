import { useState } from "react";
import { useVRStore } from "@/store/vrStore";
import DeviceCard from "@/components/dashboard/DeviceCard";
import { RefreshCw, Headset, Usb, Wifi, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function Devices() {
  const { devices, refreshDevices } = useVRStore();
  const [refreshing, setRefreshing] = useState(false);

  const connected = devices.filter((d) => d.status === "connected");
  const disconnected = devices.filter((d) => d.status === "disconnected");

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      refreshDevices();
      setRefreshing(false);
      toast.success("Liste des casques actualisée");
    }, 1200);
  };

  return (
    <div className="p-6 md:p-8 space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Casques</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Appareils Meta Quest détectés via ADB
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[hsl(var(--vr-violet)_/_0.3)] bg-[hsl(var(--vr-violet)_/_0.08)] text-[hsl(var(--vr-violet))] text-sm font-medium hover:bg-[hsl(var(--vr-violet)_/_0.15)] disabled:opacity-50 transition-all active:scale-95"
        >
          <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
          Rafraîchir
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: devices.length, color: "text-foreground" },
          { label: "Connectés", value: connected.length, color: "text-[hsl(140_70%_55%)]" },
          { label: "Déconnectés", value: disconnected.length, color: "text-muted-foreground" },
          {
            label: "Stockage moyen",
            value: `${Math.round(devices.reduce((a, d) => a + (d.storageUsedGB / d.storageTotalGB) * 100, 0) / (devices.length || 1))}%`,
            color: "text-[hsl(var(--vr-cyan))]",
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))] px-4 py-3 text-center">
            <p className={cn("text-xl font-bold tabular-nums", color)}>{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Connected devices */}
      {connected.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[hsl(140_70%_55%)] animate-pulse-glow" />
            Connectés ({connected.length})
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {connected.map((d) => <DeviceCard key={d.id} device={d} />)}
          </div>
        </section>
      )}

      {/* Disconnected devices */}
      {disconnected.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            Déconnectés ({disconnected.length})
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {disconnected.map((d) => <DeviceCard key={d.id} device={d} />)}
          </div>
        </section>
      )}

      {/* Connection guide */}
      <section className="rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
          <Info size={15} className="text-[hsl(var(--vr-cyan))]" />
          <h3 className="text-sm font-semibold">Guide de connexion</h3>
        </div>
        <div className="p-5 grid sm:grid-cols-2 gap-6">
          {/* USB */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Usb size={15} className="text-[hsl(var(--vr-violet))]" />
              Connexion USB
            </div>
            <ol className="space-y-2">
              {[
                "Créer un compte Meta Developer (gratuit)",
                "Sur le casque : Paramètres → Développeur → Activer",
                "Brancher le câble USB au PC",
                "Accepter « Autoriser le débogage » sur le casque",
                'Terminal : adb devices',
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-muted-foreground">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[hsl(var(--vr-violet)_/_0.15)] text-[hsl(var(--vr-violet))] text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                  {i === 4 ? (
                    <span>Terminal : <code className="font-mono bg-background px-1 rounded">adb devices</code></span>
                  ) : step}
                </li>
              ))}
            </ol>
          </div>

          {/* Wi-Fi */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Wifi size={15} className="text-[hsl(var(--vr-cyan))]" />
              Connexion Wi-Fi
            </div>
            <ol className="space-y-2">
              {[
                "Connecter le casque en USB d'abord",
                "Installer Meta Quest Developer Hub",
                "Utiliser le pairing Wi-Fi intégré dans MQDH",
                "Une fois pairé, déconnecter l'USB",
                'adb devices affiche l\'IP (ex: 192.168.1.42:5555)',
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-muted-foreground">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[hsl(var(--vr-cyan)_/_0.15)] text-[hsl(var(--vr-cyan))] text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                  {i === 4 ? (
                    <span><code className="font-mono bg-background px-1 rounded">adb devices</code> affiche l'IP (ex: 192.168.1.42:5555)</span>
                  ) : step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
