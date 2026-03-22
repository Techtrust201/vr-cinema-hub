import { useState, useEffect } from "react";
import { useVRStore, Device, LibraryType } from "@/store/vrStore";
import DeviceCard from "@/components/dashboard/DeviceCard";
import { RefreshCw, Usb, Wifi, Info, Plus, X, Scan, ChevronRight, Loader2, Signal } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { checkServer, fetchServerDevices, fetchDeviceStatus, connectDevice, prepareTcpip, fetchDeviceIp, ServerDevice, ServerStatus } from "@/lib/serverApi";

interface AddDeviceModalProps {
  onClose: () => void;
  initialSerial?: string;
  initialName?: string;
  initialIp?: string;
}

function AddDeviceModal({ onClose, initialSerial = "", initialName = "", initialIp = "" }: AddDeviceModalProps) {
  const addDevice = useVRStore((s) => s.addDevice);
  const [form, setForm] = useState({
    name: initialName,
    serial: initialSerial,
    type: "location" as LibraryType,
    ipAddress: initialIp,
    storageTotalGB: 128,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.serial.trim()) return;
    const device: Device = {
      id: `d-${Date.now()}`,
      serial: form.serial.trim().toUpperCase(),
      name: form.name.trim(),
      type: form.type,
      status: "disconnected",
      storageUsedGB: 0,
      storageTotalGB: form.storageTotalGB,
      battery: 0,
      lastSyncAt: null,
      ipAddress: form.ipAddress.trim() || null,
    };
    addDevice(device);
    toast.success(`Casque "${device.name}" ajouté`);
    onClose();
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {node}
    </div>
  );

  const inputCls = "w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-[hsl(var(--vr-violet)_/_0.5)] focus:outline-none text-sm transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 rounded-xl border border-[hsl(var(--vr-violet)_/_0.3)] bg-[hsl(var(--vr-surface))] p-6 shadow-[0_0_40px_hsl(var(--vr-violet)_/_0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold">Ajouter un casque</h3>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:bg-muted/50"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {field("Nom du casque *", (
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Quest 3 — Location #3"
              className={inputCls}
            />
          ))}
          {field("Numéro de série *", (
            <input
              type="text"
              value={form.serial}
              onChange={(e) => setForm({ ...form, serial: e.target.value })}
              placeholder="1WMHHA000X0000"
              className={cn(inputCls, "font-mono")}
            />
          ))}
          {field("Type de bibliothèque", (
            <div className="grid grid-cols-2 gap-2">
              {(["location", "animations"] as LibraryType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm font-medium transition-all capitalize",
                    form.type === t
                      ? t === "location"
                        ? "bg-[hsl(var(--vr-violet)_/_0.15)] border-[hsl(var(--vr-violet)_/_0.4)] text-[hsl(var(--vr-violet))]"
                        : "bg-[hsl(var(--vr-cyan)_/_0.12)] border-[hsl(var(--vr-cyan)_/_0.4)] text-[hsl(var(--vr-cyan))]"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          ))}
          {field("Adresse IP (Wi-Fi, optionnel)", (
            <input
              type="text"
              value={form.ipAddress}
              onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
              placeholder="192.168.1.45"
              className={cn(inputCls, "font-mono")}
            />
          ))}
          {field("Stockage total (GB)", (
            <select
              value={form.storageTotalGB}
              onChange={(e) => setForm({ ...form, storageTotalGB: Number(e.target.value) })}
              className={inputCls}
            >
              {[64, 128, 256, 512].map((v) => <option key={v} value={v}>{v} GB</option>)}
            </select>
          ))}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/50 transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              disabled={!form.name.trim() || !form.serial.trim()}
              className="flex-1 px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white text-sm font-medium hover:bg-[hsl(var(--vr-violet)_/_0.85)] disabled:opacity-40 transition-colors"
            >
              Ajouter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface WifiConnectModalProps {
  onClose: () => void;
  initialIp?: string;
}

function WifiConnectModal({ onClose, initialIp = "" }: WifiConnectModalProps) {
  const [ip, setIp] = useState(initialIp);
  const [port, setPort] = useState("5555");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; output: string } | null>(null);

  const handleConnect = async () => {
    if (!ip.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await connectDevice(ip.trim(), parseInt(port) || 5555);
      setResult(res);
      if (res.success) toast.success(`Connecté à ${res.address}`);
      else toast.error(`Échec : ${res.output}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setResult({ success: false, output: message });
      toast.error("Connexion Wi-Fi ADB échouée");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "px-3 py-2 rounded-lg bg-background border border-border focus:border-[hsl(var(--vr-cyan)_/_0.5)] focus:outline-none text-sm transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm mx-4 rounded-xl border border-[hsl(var(--vr-cyan)_/_0.3)] bg-[hsl(var(--vr-surface))] p-6 shadow-[0_0_40px_hsl(var(--vr-cyan)_/_0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Wifi size={15} className="text-[hsl(var(--vr-cyan))]" />
            <h3 className="text-base font-semibold">Connexion Wi-Fi ADB</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:bg-muted/50"><X size={15} /></button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Adresse IP du casque *</label>
            <input
              autoFocus
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              placeholder="192.168.1.42"
              className={cn(inputCls, "w-full font-mono")}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Port ADB (défaut 5555)</label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="5555"
              className={cn(inputCls, "w-full font-mono")}
            />
          </div>

          {result && (
            <div className={cn(
              "px-3 py-2.5 rounded-lg text-xs font-mono break-all border",
              result.success
                ? "bg-[hsl(140_70%_40%_/_0.08)] border-[hsl(140_70%_40%_/_0.25)] text-[hsl(140_70%_55%)]"
                : "bg-destructive/8 border-destructive/25 text-destructive"
            )}>
              {result.output}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/50 transition-colors">
              Fermer
            </button>
            <button
              onClick={handleConnect}
              disabled={!ip.trim() || loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--vr-cyan)_/_0.12)] border border-[hsl(var(--vr-cyan)_/_0.3)] text-[hsl(var(--vr-cyan))] text-sm font-medium hover:bg-[hsl(var(--vr-cyan)_/_0.2)] disabled:opacity-40 transition-all active:scale-95"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
              Connecter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AdbDetectPanelProps {
  adbDevices: ServerDevice[];
  onAdd: (d: ServerDevice) => void;
  onClose: () => void;
}

function AdbDetectPanel({ adbDevices, onAdd, onClose }: AdbDetectPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md mx-4 rounded-xl border border-[hsl(var(--vr-cyan)_/_0.35)] bg-[hsl(var(--vr-surface))] p-6 shadow-[0_0_40px_hsl(var(--vr-cyan)_/_0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Scan size={15} className="text-[hsl(var(--vr-cyan))]" />
            <h3 className="text-base font-semibold">Appareils ADB détectés</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:bg-muted/50"><X size={15} /></button>
        </div>

        {adbDevices.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground/60">
            Aucun appareil ADB trouvé.<br />
            <span className="text-xs">Vérifiez que votre casque est branché et que le débogage USB est activé.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {adbDevices.map((d) => (
              <div
                key={d.serial}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/50 bg-background/40 hover:border-[hsl(var(--vr-cyan)_/_0.3)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.model || "Meta Quest"}</p>
                  <p className="text-[11px] font-mono text-muted-foreground/70 truncate">{d.serial}</p>
                  {d.ipAddress && (
                    <p className="text-[10px] font-mono text-[hsl(var(--vr-cyan)_/_0.7)]">{d.ipAddress}</p>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0",
                  d.status === "device"
                    ? "bg-[hsl(140_70%_40%_/_0.12)] text-[hsl(140_70%_55%)] border-[hsl(140_70%_40%_/_0.3)]"
                    : "bg-muted/40 text-muted-foreground border-border/40"
                )}>
                  {d.status === "device" ? "Connecté" : d.status}
                </span>
                <button
                  onClick={() => onAdd(d)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[hsl(var(--vr-cyan)_/_0.1)] border border-[hsl(var(--vr-cyan)_/_0.3)] text-[hsl(var(--vr-cyan))] text-xs font-medium hover:bg-[hsl(var(--vr-cyan)_/_0.18)] transition-colors active:scale-95 shrink-0"
                >
                  Ajouter <ChevronRight size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Devices() {
  const { devices, settings, refreshDevices, updateDevice, removeDevice } = useVRStore();
  const [refreshing, setRefreshing] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [wifiModalOpen, setWifiModalOpen] = useState(false);
  const [wifiInitialIp, setWifiInitialIp] = useState("");
  const [addInitial, setAddInitial] = useState<{ serial?: string; name?: string; ip?: string }>({});

  // ADB detect state
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [adbDetecting, setAdbDetecting] = useState(false);
  const [adbDevices, setAdbDevices] = useState<ServerDevice[]>([]);
  const [adbPanelOpen, setAdbPanelOpen] = useState(false);

  const isDemo = settings.demoMode;

  useEffect(() => {
    if (isDemo) {
      setServerStatus("disconnected");
      return;
    }
    checkServer(settings.serverUrl, settings.authToken).then(setServerStatus);
  }, [settings.serverUrl, settings.authToken, isDemo]);

  const connected = devices.filter((d) => d.status === "connected");
  const disconnected = devices.filter((d) => d.status === "disconnected");

  /** Refresh real ADB status (battery + storage) for all connected devices */
  const handleRefresh = async () => {
    setRefreshing(true);
    if (serverStatus === "connected") {
      // Real mode: fetch live data from ADB for each device
      const results = await Promise.allSettled(
        devices.map(async (d) => {
          try {
            const status = await fetchDeviceStatus(d.serial);
            updateDevice(d.id, {
              battery: status.battery,
              storageUsedGB: status.storageUsedGB > 0 ? status.storageUsedGB : d.storageUsedGB,
              storageTotalGB: status.storageTotalGB > 0 ? status.storageTotalGB : d.storageTotalGB,
              status: status.status === "connected" ? "connected" : "disconnected",
            });
          } catch {
            // Silently skip devices that don't respond
          }
        })
      );
      const updated = results.filter((r) => r.status === "fulfilled").length;
      toast.success(`${updated} casque(s) actualisé(s) depuis ADB`);
    } else {
      // Demo mode: simulate
      refreshDevices();
      setTimeout(() => {
        toast.success("Liste des casques actualisée (mode démo)");
      }, 800);
    }
    setRefreshing(false);
  };

  const handleRemove = (id: string, name: string) => {
    removeDevice(id);
    toast.info(`Casque "${name}" supprimé`);
  };

  const handlePrepareWifi = async (device: Device) => {
    const baseUrl = settings.publicServerUrl?.trim() || settings.serverUrl?.trim() || undefined;
    try {
      await prepareTcpip(device.serial, baseUrl);
      toast.success(`${device.name} prêt en Wi-Fi — détection de l'IP…`);
      // Auto-detect IP and open Wi-Fi modal pre-filled
      try {
        const { ip } = await fetchDeviceIp(device.serial, baseUrl);
        setWifiInitialIp(ip);
        toast.success(`IP détectée : ${ip} — débranchez le câble`);
      } catch {
        setWifiInitialIp("");
        toast.info("IP non détectée — entrez-la manuellement");
      }
      setWifiModalOpen(true);
    } catch {
      toast.error(`Impossible de préparer ${device.name} en Wi-Fi`);
    }
  };

  const handleAdbDetect = async () => {
    setAdbDetecting(true);
    try {
      const found = await fetchServerDevices(settings.serverUrl);
      setAdbDevices(found);
      setAdbPanelOpen(true);
    } catch {
      toast.error("Impossible de contacter le serveur ADB");
    } finally {
      setAdbDetecting(false);
    }
  };

  const handleAddFromAdb = (d: ServerDevice) => {
    setAdbPanelOpen(false);
    setAddInitial({
      serial: d.serial,
      name: d.model ? `Meta ${d.model}` : "Meta Quest",
      ip: d.ipAddress ?? "",
    });
    setAddModalOpen(true);
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Wi-Fi connect button */}
          <button
            onClick={() => setWifiModalOpen(true)}
            disabled={serverStatus !== "connected"}
            title={serverStatus !== "connected" ? "Démarrez le serveur local pour utiliser cette fonction" : "Connecter un casque via Wi-Fi ADB"}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all active:scale-95",
              serverStatus === "connected"
                ? "border-[hsl(var(--vr-cyan)_/_0.35)] bg-[hsl(var(--vr-cyan)_/_0.08)] text-[hsl(var(--vr-cyan))] hover:bg-[hsl(var(--vr-cyan)_/_0.15)]"
                : "border-border/40 bg-muted/30 text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            <Signal size={14} />
            Wi-Fi ADB
          </button>

          {/* ADB Detect button */}
          <button
            onClick={handleAdbDetect}
            disabled={serverStatus !== "connected" || adbDetecting}
            title={serverStatus !== "connected" ? "Démarrez le serveur local pour utiliser cette fonction" : "Détecter les casques connectés via ADB"}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all active:scale-95",
              serverStatus === "connected"
                ? "border-[hsl(140_70%_40%_/_0.35)] bg-[hsl(140_70%_40%_/_0.08)] text-[hsl(140_70%_55%)] hover:bg-[hsl(140_70%_40%_/_0.15)]"
                : "border-border/40 bg-muted/30 text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            {adbDetecting ? <Loader2 size={14} className="animate-spin" /> : <Scan size={14} />}
            Détecter via ADB
            {serverStatus === "checking" && <Loader2 size={11} className="animate-spin opacity-50" />}
            {serverStatus === "disconnected" && <span className="text-[10px] opacity-60">(serveur hors ligne)</span>}
          </button>

          <button
            onClick={() => { setAddInitial({}); setAddModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[hsl(var(--vr-violet)_/_0.3)] bg-[hsl(var(--vr-violet)_/_0.08)] text-[hsl(var(--vr-violet))] text-sm font-medium hover:bg-[hsl(var(--vr-violet)_/_0.15)] transition-all active:scale-95"
          >
            <Plus size={14} /> Ajouter
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title={serverStatus === "connected" ? "Lecture batterie + stockage depuis ADB" : "Rafraîchir (mode démo)"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[hsl(var(--vr-violet)_/_0.3)] bg-[hsl(var(--vr-violet)_/_0.08)] text-[hsl(var(--vr-violet))] text-sm font-medium hover:bg-[hsl(var(--vr-violet)_/_0.15)] disabled:opacity-50 transition-all active:scale-95"
          >
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
            {serverStatus === "connected" ? "Rafraîchir ADB" : "Rafraîchir"}
          </button>
        </div>
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
            {connected.map((d) => (
              <DeviceCard
                key={d.id}
                device={d}
                onUpdate={(updates) => updateDevice(d.id, updates)}
                onRemove={() => handleRemove(d.id, d.name)}
                onPrepareWifi={serverStatus === "connected" ? () => handlePrepareWifi(d) : undefined}
              />
            ))}
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
            {disconnected.map((d) => (
              <DeviceCard
                key={d.id}
                device={d}
                onUpdate={(updates) => updateDevice(d.id, updates)}
                onRemove={() => handleRemove(d.id, d.name)}
              />
            ))}
          </div>
        </section>
      )}

      {devices.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/50 py-16 flex flex-col items-center gap-3 text-muted-foreground/50">
          <p className="text-sm">Aucun casque. Ajoutez-en un ou rafraîchissez.</p>
        </div>
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
              Connexion Wi-Fi ADB
            </div>
            <ol className="space-y-2">
              {[
                "Connecter le casque en USB d'abord",
                "Terminal : adb tcpip 5555",
                "Débrancher le câble USB",
                "Cliquer sur « Wi-Fi ADB » en haut de la page",
                "Entrer l'IP du casque et cliquer Connecter",
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-muted-foreground">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[hsl(var(--vr-cyan)_/_0.15)] text-[hsl(var(--vr-cyan))] text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                  {i === 1 ? (
                    <span>Terminal : <code className="font-mono bg-background px-1 rounded">adb tcpip 5555</code></span>
                  ) : step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {addModalOpen && (
        <AddDeviceModal
          onClose={() => setAddModalOpen(false)}
          initialSerial={addInitial.serial}
          initialName={addInitial.name}
          initialIp={addInitial.ip}
        />
      )}
      {wifiModalOpen && (
        <WifiConnectModal onClose={() => setWifiModalOpen(false)} initialIp={wifiInitialIp} />
      )}
      {adbPanelOpen && (
        <AdbDetectPanel
          adbDevices={adbDevices}
          onAdd={handleAddFromAdb}
          onClose={() => setAdbPanelOpen(false)}
        />
      )}
    </div>
  );
}
