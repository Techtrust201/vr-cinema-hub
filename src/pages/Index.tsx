import { useVRStore } from "@/store/vrStore";
import StatsCard from "@/components/dashboard/StatsCard";
import SyncLogItem from "@/components/dashboard/SyncLogItem";
import { Library, Headset, RefreshCw, Clock, ArrowRight, Wifi } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function Index() {
  const { libraries, devices, syncLogs } = useVRStore();

  const totalVideosLocation = libraries
    .find((l) => l.id === "location")
    ?.playlists.reduce((acc, p) => acc + p.videos.length, 0) ?? 0;
  const totalVideosAnimations = libraries
    .find((l) => l.id === "animations")
    ?.playlists.reduce((acc, p) => acc + p.videos.length, 0) ?? 0;
  const connectedDevices = devices.filter((d) => d.status === "connected").length;
  const lastSync = syncLogs[0]?.at
    ? new Date(syncLogs[0].at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

  const quickLinks = [
    { to: "/libraries", icon: Library, label: "Bibliothèques", sub: "Gérer vidéos & playlists", accent: "violet" as const },
    { to: "/devices", icon: Headset, label: "Casques", sub: "Voir les appareils ADB", accent: "cyan" as const },
    { to: "/sync", icon: RefreshCw, label: "Synchronisation", sub: "Envoyer les vidéos", accent: "green" as const },
  ];

  return (
    <div className="p-6 md:p-8 space-y-8 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight gradient-text">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vue d'ensemble de votre système VR Ultimate
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Vidéos Location"
          value={totalVideosLocation}
          sub="bibliothèque location"
          icon={Library}
          accent="violet"
        />
        <StatsCard
          label="Vidéos Animations"
          value={totalVideosAnimations}
          sub="bibliothèque animations"
          icon={Library}
          accent="cyan"
        />
        <StatsCard
          label="Casques connectés"
          value={`${connectedDevices}/${devices.length}`}
          sub="via ADB (USB/Wi-Fi)"
          icon={Headset}
          accent={connectedDevices > 0 ? "green" : "red"}
        />
        <StatsCard
          label="Dernière sync"
          value={lastSync}
          sub={syncLogs[0]?.status === "success" ? "Réussie" : syncLogs[0]?.status === "error" ? "Échec" : "—"}
          icon={Clock}
          accent={syncLogs[0]?.status === "error" ? "red" : "violet"}
        />
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Accès rapide
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {quickLinks.map(({ to, icon: Icon, label, sub, accent }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "group flex items-center gap-4 px-4 py-4 rounded-xl border bg-[hsl(var(--vr-surface))] hover:bg-muted/40 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                accent === "violet" && "hover:border-[hsl(var(--vr-violet)_/_0.4)]",
                accent === "cyan" && "hover:border-[hsl(var(--vr-cyan)_/_0.4)]",
                accent === "green" && "hover:border-[hsl(140_70%_55%_/_0.4)]"
              )}
            >
              <div className={cn(
                "p-2.5 rounded-lg",
                accent === "violet" && "bg-[hsl(var(--vr-violet)_/_0.12)] text-[hsl(var(--vr-violet))]",
                accent === "cyan" && "bg-[hsl(var(--vr-cyan)_/_0.12)] text-[hsl(var(--vr-cyan))]",
                accent === "green" && "bg-[hsl(140_60%_50%_/_0.12)] text-[hsl(140_60%_55%)]"
              )}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
              <ArrowRight size={15} className="text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </div>

      {/* Devices quick status */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          État des casques
        </h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {devices.map((device) => (
            <div key={device.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/50 bg-[hsl(var(--vr-surface))]">
              <span className={cn(
                "w-2 h-2 rounded-full shrink-0",
                device.status === "connected" ? "bg-[hsl(140_70%_55%)] animate-pulse-glow" :
                device.status === "syncing" ? "bg-[hsl(var(--vr-cyan))] animate-pulse-glow" :
                "bg-muted-foreground/30"
              )} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{device.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{device.serial}</p>
              </div>
              {device.ipAddress && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono shrink-0">
                  <Wifi size={10} /> {device.ipAddress}
                </span>
              )}
              <span className={cn(
                "text-[11px] font-medium shrink-0",
                device.status === "connected" ? "text-[hsl(140_70%_55%)]" :
                device.status === "syncing" ? "text-[hsl(var(--vr-cyan))]" :
                "text-muted-foreground/60"
              )}>
                {device.status === "connected" ? "Connecté" : device.status === "syncing" ? "Sync…" : "Déconnecté"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent sync logs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Activité récente
          </h2>
          <Link to="/sync" className="text-xs text-[hsl(var(--vr-violet))] hover:underline">
            Voir tout →
          </Link>
        </div>
        <div className="space-y-2">
          {syncLogs.slice(0, 3).map((log) => (
            <SyncLogItem key={log.id} log={log} />
          ))}
        </div>
      </div>
    </div>
  );
}
