import { useState, useRef, useEffect } from "react";
import { useVRStore, LibraryType, SyncLog } from "@/store/vrStore";
import SyncLogItem from "@/components/dashboard/SyncLogItem";
import { cn } from "@/lib/utils";
import { Play, RefreshCw, Headset, Library, Trash2, Zap, Radio } from "lucide-react";
import { toast } from "sonner";
import { checkServer, startSync, createSyncStream, ServerStatus } from "@/lib/serverApi";

function generateSyncLines(
  library: LibraryType,
  deviceName: string,
  deviceSerial: string,
  videos: string[],
  pushed: number,
  skipped: number
): string[] {
  const now = new Date();
  const ts = () => {
    const d = new Date(now.getTime() + Math.random() * 2000);
    return `[${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}]`;
  };
  const lines: string[] = [];
  lines.push(`${ts()} Connexion ADB → ${deviceSerial} ✓`);
  lines.push(`${ts()} Bibliothèque : ${library === "location" ? "Location" : "Animations"}`);
  lines.push(`${ts()} Comparaison des fichiers sur ${deviceName}...`);
  videos.forEach((v, i) => {
    if (i < pushed) {
      lines.push(`${ts()} Push: ${v} ✓`);
    } else {
      lines.push(`${ts()} Skip: ${v} (déjà présent)`);
    }
  });
  lines.push(`${ts()} manifest.json envoyé ✓`);
  lines.push(`${ts()} Sync terminée — ${pushed} fichier(s) envoyé(s), ${skipped} ignoré(s).`);
  return lines;
}

export default function Sync() {
  const { libraries, devices, syncLogs, settings, addSyncLog, updateSyncLog, updateDevice, clearSyncLogs } = useVRStore();
  const [selectedLib, setSelectedLib] = useState<LibraryType>("location");
  const [selectedDevice, setSelectedDevice] = useState<"all" | string>("all");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<string[]>([]);

  // Server connection state
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");

  useEffect(() => {
    const isDemo = settings.demoMode;
    if (isDemo) {
      setServerStatus("disconnected");
      return;
    }
    checkServer(settings.serverUrl, settings.authToken).then(setServerStatus);
  }, [settings.serverUrl, settings.authToken, settings.demoMode]);

  const isRealMode = !settings.demoMode && serverStatus === "connected";

  const connectedDevices = devices.filter((d) => d.status === "connected");
  const library = libraries.find((l) => l.id === selectedLib);
  const allVideos = library?.playlists.flatMap((p) => p.videos) ?? [];
  const targetDevices = selectedDevice === "all" ? connectedDevices : connectedDevices.filter((d) => d.id === selectedDevice);

  useEffect(() => {
    if (activeLogId) logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeLogId, syncLogs]);

  // ── REAL ADB SYNC (SSE streaming) ──
  const handleRealSync = async (logId: string) => {
    const startLine = `[${new Date().toLocaleTimeString()}] Démarrage de la synchronisation ADB…`;

    const newLog: SyncLog = {
      id: logId,
      at: new Date().toISOString(),
      library: selectedLib,
      deviceIds: targetDevices.map((d) => d.id),
      videosTotal: allVideos.length,
      videosPushed: 0,
      videosSkipped: 0,
      status: "running",
      lines: [startLine],
    };
    addSyncLog(newLog);
    setActiveLogId(logId);
    setRunning(true);
    setProgress(5);

    let totalPushed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    try {
      for (const device of targetDevices) {
        const deviceLine = `[${new Date().toLocaleTimeString()}] → Casque : ${device.name} (${device.serial})`;
        updateSyncLog(logId, { lines: [startLine, deviceLine] });

        // Start the job, get jobId
        const { jobId } = await startSync(settings.serverUrl, {
          deviceSerial: device.serial,
          videoStoragePath: settings.videoStoragePath,
          videos: allVideos.map((v) => ({ name: v.name, sizeGB: v.sizeGB })),
        });

        // Stream SSE lines
        await new Promise<void>((resolve, reject) => {
          const es = createSyncStream(jobId, settings.serverUrl);
          const accLines: string[] = [startLine, deviceLine];

          es.onmessage = (ev) => {
            try {
              const data = JSON.parse(ev.data);
              if (data.line) {
                accLines.push(data.line);
                updateSyncLog(logId, { lines: [...accLines] });
                // Estimate progress from percentage mentions in lines
                const pctMatch = data.line.match(/(\d+)%/);
                if (pctMatch) {
                  const pct = Math.min(parseInt(pctMatch[1], 10), 95);
                  setProgress(pct);
                } else {
                  setProgress((p) => Math.min(p + 2, 92));
                }
              }
              if (data.done) {
                es.close();
                if (data.summary) {
                  totalPushed += data.summary.pushed ?? 0;
                  totalSkipped += data.summary.skipped ?? 0;
                  totalErrors += data.summary.errors ?? 0;
                }
                resolve();
              }
            } catch {}
          };

          es.onerror = () => {
            es.close();
            reject(new Error("SSE stream error"));
          };
        });

        const now = new Date().toISOString();
        updateDevice(device.id, { lastSyncAt: now });
      }

      setProgress(100);
      updateSyncLog(logId, {
        status: totalErrors > 0 ? "error" : "success",
        videosPushed: totalPushed,
        videosSkipped: totalSkipped,
      });

      if (totalErrors > 0) {
        toast.warning(`Sync terminée avec ${totalErrors} erreur(s)`);
      } else {
        toast.success(`Sync ADB terminée — ${totalPushed} fichier(s) envoyé(s)`);
      }
    } catch (err) {
      const errLine = `[${new Date().toLocaleTimeString()}] ✗ Erreur : ${err instanceof Error ? err.message : "Erreur inconnue"}`;
      updateSyncLog(logId, { status: "error", lines: [startLine, errLine] });
      toast.error("La synchronisation ADB a échoué");
    } finally {
      setRunning(false);
      setActiveLogId(null);
    }
  };

  // ── SIMULATED SYNC ──
  const handleSimulatedSync = (logId: string) => {
    const pushed = Math.ceil(allVideos.length * 0.4);
    const skipped = allVideos.length - pushed;
    const startLine = `[${new Date().toLocaleTimeString()}] Démarrage de la synchronisation (simulation)…`;

    linesRef.current = [startLine];

    const newLog: SyncLog = {
      id: logId,
      at: new Date().toISOString(),
      library: selectedLib,
      deviceIds: targetDevices.map((d) => d.id),
      videosTotal: allVideos.length,
      videosPushed: 0,
      videosSkipped: 0,
      status: "running",
      lines: [startLine],
    };

    addSyncLog(newLog);
    setActiveLogId(logId);
    setRunning(true);
    setProgress(0);

    let step = 0;
    const totalSteps = allVideos.length + 3;

    const interval = setInterval(() => {
      step++;
      const pct = Math.round((step / totalSteps) * 100);
      setProgress(Math.min(pct, 95));

      if (step >= totalSteps) {
        clearInterval(interval);
        setProgress(100);

        const finalLines = generateSyncLines(
          selectedLib,
          targetDevices.map((d) => d.name).join(", "),
          targetDevices[0].serial,
          allVideos.map((v) => v.name),
          pushed,
          skipped
        );

        updateSyncLog(logId, {
          status: "success",
          videosPushed: pushed,
          videosSkipped: skipped,
          lines: finalLines,
        });

        const now = new Date().toISOString();
        targetDevices.forEach((d) => updateDevice(d.id, { lastSyncAt: now }));

        setRunning(false);
        setActiveLogId(null);
        toast.success(`Sync simulée — ${pushed} fichier(s) envoyé(s)`);
      } else {
        const progressLine = `[${new Date().toLocaleTimeString()}] Traitement en cours… ${pct}%`;
        linesRef.current = [...linesRef.current, progressLine];
        updateSyncLog(logId, { lines: [...linesRef.current] });
      }
    }, 300);
  };

  const handleSync = (forceSimulation = false) => {
    if (targetDevices.length === 0) {
      toast.error("Aucun casque connecté disponible");
      return;
    }
    if (allVideos.length === 0) {
      toast.error("La bibliothèque est vide");
      return;
    }

    const logId = `log-${Date.now()}`;

    if (!forceSimulation && serverStatus === "connected") {
      handleRealSync(logId);
    } else {
      handleSimulatedSync(logId);
    }
  };

  const canSync = !running && targetDevices.length > 0 && allVideos.length > 0;


  return (
    <div className="p-6 md:p-8 space-y-8 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Synchronisation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envoyez les vidéos vers les casques via ADB
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Config panel */}
        <div className="rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))] overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Configuration</h2>
            {/* Mode badge */}
            <span className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border",
              serverStatus === "checking"
                ? "bg-muted/40 text-muted-foreground border-border/40"
                : isRealMode
                  ? "bg-[hsl(140_70%_40%_/_0.12)] text-[hsl(140_70%_55%)] border-[hsl(140_70%_40%_/_0.3)]"
                  : "bg-[hsl(40_80%_50%_/_0.12)] text-[hsl(40_80%_60%)] border-[hsl(40_80%_50%_/_0.3)]"
            )}>
              {serverStatus === "checking" ? (
                <><RefreshCw size={9} className="animate-spin" /> Vérification…</>
              ) : isRealMode ? (
                <><Zap size={9} /> Mode réel</>
              ) : (
                <><Radio size={9} /> Simulation</>
              )}
            </span>
          </div>
          <div className="p-5 space-y-5">
            {/* Library selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Library size={12} /> Bibliothèque source
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["location", "animations"] as LibraryType[]).map((lib) => {
                  const count = libraries.find((l) => l.id === lib)?.playlists.reduce((a, p) => a + p.videos.length, 0) ?? 0;
                  return (
                    <button
                      key={lib}
                      onClick={() => setSelectedLib(lib)}
                      className={cn(
                        "px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left",
                        selectedLib === lib
                          ? lib === "location"
                            ? "bg-[hsl(var(--vr-violet)_/_0.15)] border-[hsl(var(--vr-violet)_/_0.4)] text-[hsl(var(--vr-violet))]"
                            : "bg-[hsl(var(--vr-cyan)_/_0.12)] border-[hsl(var(--vr-cyan)_/_0.4)] text-[hsl(var(--vr-cyan))]"
                          : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                      )}
                    >
                      <p className="capitalize">{lib}</p>
                      <p className="text-[11px] opacity-70 mt-0.5">{count} vidéo(s)</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Device selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Headset size={12} /> Casque cible
              </label>
              {connectedDevices.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
                  Aucun casque connecté. Branchez un appareil et rafraîchissez la page Casques.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <button
                    onClick={() => setSelectedDevice("all")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition-all text-left",
                      selectedDevice === "all"
                        ? "bg-[hsl(var(--vr-violet)_/_0.12)] border-[hsl(var(--vr-violet)_/_0.35)] text-[hsl(var(--vr-violet))]"
                        : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                    )}
                  >
                    <span className="w-2 h-2 rounded-full bg-[hsl(140_70%_55%)]" />
                    Tous les casques connectés
                    <span className="ml-auto text-xs opacity-60">({connectedDevices.length})</span>
                  </button>
                  {connectedDevices.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDevice(d.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition-all text-left",
                        selectedDevice === d.id
                          ? "bg-[hsl(var(--vr-violet)_/_0.12)] border-[hsl(var(--vr-violet)_/_0.35)] text-[hsl(var(--vr-violet))]"
                          : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                      )}
                    >
                      <span className="w-2 h-2 rounded-full bg-[hsl(140_70%_55%)]" />
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto text-[11px] font-mono opacity-60 shrink-0">{d.serial.slice(-6)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-background/40 border border-border/40 px-4 py-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">{allVideos.length}</span> vidéo(s) à synchroniser
              </p>
              <p className="text-xs text-muted-foreground">
                vers <span className="text-foreground font-medium">
                  {selectedDevice === "all" ? `${connectedDevices.length} casque(s)` : targetDevices[0]?.name ?? "—"}
                </span>
              </p>
            </div>

            {/* Progress */}
            {running && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{isRealMode ? "Sync ADB en cours…" : "Simulation en cours…"}</span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--vr-violet))] to-[hsl(var(--vr-cyan))] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Launch buttons */}
            <div className="space-y-2">
              <button
                onClick={() => handleSync(false)}
                disabled={!canSync}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98]",
                  canSync
                    ? isRealMode
                      ? "bg-[hsl(140_70%_38%)] text-white hover:bg-[hsl(140_70%_32%)] shadow-[0_0_20px_hsl(140_70%_38%_/_0.3)]"
                      : "bg-[hsl(var(--vr-violet))] text-white hover:bg-[hsl(var(--vr-violet)_/_0.85)] glow-violet"
                    : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                )}
              >
                {running ? (
                  <><RefreshCw size={15} className="animate-spin" /> {isRealMode ? "Sync ADB en cours…" : "Synchronisation en cours…"}</>
                ) : (
                  <>{isRealMode ? <Zap size={15} /> : <Play size={15} />} {isRealMode ? "Lancer (ADB réel)" : "Lancer la synchronisation"}</>
                )}
              </button>

              {/* Force simulation button when server is connected */}
              {isRealMode && !running && (
                <button
                  onClick={() => handleSync(true)}
                  disabled={!canSync}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium border transition-all duration-200 active:scale-[0.98]",
                    canSync
                      ? "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                      : "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                  )}
                >
                  <Radio size={12} /> Lancer en simulation
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: quick video list */}
        <div className="rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))] overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="text-sm font-semibold">
              Contenu — <span className="capitalize">{selectedLib}</span>
            </h2>
          </div>
          <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
            {allVideos.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 text-center py-8">
                Aucune vidéo dans cette bibliothèque
              </p>
            ) : (
              allVideos.map((v) => (
                <div key={v.id} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-background/40 border border-border/30">
                  <span className="font-mono text-foreground/80 truncate flex-1">{v.name}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0",
                    v.format === "360" ? "bg-[hsl(var(--vr-violet)_/_0.15)] text-[hsl(var(--vr-violet))] border-[hsl(var(--vr-violet)_/_0.3)]" : "bg-[hsl(var(--vr-cyan)_/_0.15)] text-[hsl(var(--vr-cyan))] border-[hsl(var(--vr-cyan)_/_0.3)]"
                  )}>
                    {v.format}°
                  </span>
                  <span className="text-muted-foreground/60 font-mono shrink-0">{v.sizeGB.toFixed(1)}G</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Historique des synchronisations
          </h2>
          {syncLogs.length > 0 && (
            <button
              onClick={() => { clearSyncLogs(); toast.info("Historique vidé"); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border/50 hover:border-destructive/40 hover:text-destructive transition-all"
            >
              <Trash2 size={11} /> Vider l'historique
            </button>
          )}
        </div>
        {syncLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">Aucune synchronisation effectuée.</p>
        ) : (
          <div className="space-y-2">
            {syncLogs.map((log) => (
              <SyncLogItem key={log.id} log={log} />
            ))}
          </div>
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
