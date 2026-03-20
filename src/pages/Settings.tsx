import { useState, useEffect } from "react";
import { useVRStore } from "@/store/vrStore";
import { checkServer } from "@/lib/serverApi";
import {
  FolderOpen,
  HardDrive,
  KeyRound,
  AlertTriangle,
  RotateCcw,
  Save,
  Eye,
  EyeOff,
  Check,
  Server,
  Wifi,
  WifiOff,
  Loader2,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { settings, updateSettings, resetStore } = useVRStore();
  const [form, setForm] = useState({ ...settings });
  const [showToken, setShowToken] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saved, setSaved] = useState(false);

  // Server connection test
  const [serverStatus, setServerStatus] = useState<"idle" | "checking" | "connected" | "disconnected">("idle");

  const isDirty =
    form.videoStoragePath !== settings.videoStoragePath ||
    form.maxUploadGB !== settings.maxUploadGB ||
    form.authToken !== settings.authToken ||
    form.serverUrl !== settings.serverUrl;

  // Auto-check server status on mount
  useEffect(() => {
    if (settings.serverUrl) {
      handleTestServer(settings.serverUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success("Paramètres sauvegardés");
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    resetStore();
    setForm({ videoStoragePath: "/videos/vr-ultimate", maxUploadGB: 10, authToken: "", serverUrl: "http://localhost:3001" });
    setConfirmReset(false);
    toast.success("Données réinitialisées");
  };

  const handleTestServer = async (url?: string) => {
    const target = url ?? form.serverUrl;
    if (!target.trim()) return;
    setServerStatus("checking");
    const status = await checkServer(target.trim());
    setServerStatus(status === "connected" ? "connected" : "disconnected");
    if (status === "connected") {
      toast.success("Serveur local connecté ✓");
    } else {
      toast.error("Serveur local non disponible — mode simulation actif");
    }
  };

  const inputCls =
    "w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-[hsl(var(--vr-violet)_/_0.6)] focus:outline-none text-sm transition-colors text-foreground placeholder:text-muted-foreground/50";

  return (
    <div className="p-6 md:p-8 space-y-8 animate-fade-in-up max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configuration du dashboard VR Ultimate
        </p>
      </div>

      {/* Storage settings */}
      <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
          <HardDrive size={15} className="text-[hsl(var(--vr-violet))]" />
          <h2 className="text-sm font-semibold">Stockage & Vidéos</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <FolderOpen size={12} />
              Chemin du stockage vidéo
            </label>
            <input
              type="text"
              value={form.videoStoragePath}
              onChange={(e) => setForm({ ...form, videoStoragePath: e.target.value })}
              placeholder="/videos/vr-ultimate"
              className={cn(inputCls, "font-mono text-[13px]")}
            />
            <p className="text-[11px] text-muted-foreground/60">
              Répertoire local ou réseau où sont stockées les vidéos source. Ce chemin est utilisé par le serveur local pour les push ADB.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Taille maximale d'upload (GB)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={form.maxUploadGB}
                onChange={(e) => setForm({ ...form, maxUploadGB: Number(e.target.value) })}
                className="flex-1 accent-[hsl(var(--vr-violet))]"
              />
              <span className="w-16 text-center text-sm font-mono tabular-nums text-[hsl(var(--vr-violet))] bg-[hsl(var(--vr-violet)_/_0.1)] border border-[hsl(var(--vr-violet)_/_0.25)] rounded-lg px-2 py-1">
                {form.maxUploadGB} GB
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              Taille limite par vidéo lors de l'ajout dans une bibliothèque.
            </p>
          </div>
        </div>
      </section>

      {/* Server connection */}
      <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server size={15} className="text-[hsl(var(--vr-cyan))]" />
            <h2 className="text-sm font-semibold">Serveur local ADB</h2>
          </div>
          {serverStatus !== "idle" && (
            <span className={cn(
              "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border",
              serverStatus === "checking" && "text-muted-foreground border-border/50",
              serverStatus === "connected" && "text-[hsl(140_70%_55%)] bg-[hsl(140_70%_40%_/_0.1)] border-[hsl(140_70%_40%_/_0.3)]",
              serverStatus === "disconnected" && "text-[hsl(35_90%_55%)] bg-[hsl(35_90%_55%_/_0.1)] border-[hsl(35_90%_55%_/_0.3)]",
            )}>
              {serverStatus === "checking" && <Loader2 size={10} className="animate-spin" />}
              {serverStatus === "connected" && <Wifi size={10} />}
              {serverStatus === "disconnected" && <WifiOff size={10} />}
              {serverStatus === "checking" ? "Vérification…" : serverStatus === "connected" ? "Serveur connecté" : "Mode simulation"}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Server size={12} />
              URL du serveur local
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.serverUrl}
                onChange={(e) => setForm({ ...form, serverUrl: e.target.value })}
                placeholder="http://localhost:3001"
                className={cn(inputCls, "font-mono text-[13px] flex-1")}
              />
              <button
                type="button"
                onClick={() => handleTestServer()}
                disabled={serverStatus === "checking"}
                className="shrink-0 px-4 py-2 rounded-lg border border-[hsl(var(--vr-cyan)_/_0.35)] bg-[hsl(var(--vr-cyan)_/_0.08)] text-[hsl(var(--vr-cyan))] text-xs font-medium hover:bg-[hsl(var(--vr-cyan)_/_0.15)] disabled:opacity-50 transition-all"
              >
                {serverStatus === "checking" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : "Tester"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              Lancez <code className="font-mono bg-background px-1 rounded text-[10px]">node server/sync-server.js</code> sur votre ordinateur pour activer les syncs ADB réelles et la lecture vidéo.
            </p>
          </div>

          {/* Setup instructions */}
          <div className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Terminal size={12} />
              Guide de démarrage rapide
            </div>
            <div className="space-y-2">
              {[
                { cmd: "cd server && npm init -y && npm install express cors", desc: "Installer les dépendances" },
                { cmd: "VIDEO_STORAGE_PATH=/vos/videos node sync-server.js", desc: "Démarrer le serveur" },
              ].map(({ cmd, desc }) => (
                <div key={cmd} className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground/60">{desc}</p>
                  <code className="block text-[11px] font-mono bg-background px-3 py-1.5 rounded border border-border/40 text-foreground/80 overflow-x-auto whitespace-nowrap">
                    {cmd}
                  </code>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/50">
              Sans serveur : l'application fonctionne en mode simulation (aucune vraie ADB, aucune lecture vidéo réelle).
            </p>
          </div>
        </div>
      </section>

      {/* Auth settings */}
      <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
          <KeyRound size={15} className="text-[hsl(var(--vr-cyan))]" />
          <h2 className="text-sm font-semibold">Authentification</h2>
        </div>
        <div className="p-5 space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <KeyRound size={12} />
            Token d'accès
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={form.authToken}
              onChange={(e) => setForm({ ...form, authToken: e.target.value })}
              placeholder="vr-secret-token-…"
              className={cn(inputCls, "font-mono text-[13px] pr-10")}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground/60">
            Token transmis dans les headers des requêtes au serveur local. Laissez vide pour désactiver.
          </p>
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!isDirty && !saved}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95",
            saved
              ? "bg-[hsl(140_70%_40%)] text-white"
              : isDirty
              ? "bg-[hsl(var(--vr-violet))] text-white hover:bg-[hsl(var(--vr-violet)_/_0.85)] glow-violet"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
          )}
        >
          {saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? "Sauvegardé !" : "Sauvegarder"}
        </button>
      </div>

      {/* Danger zone */}
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-destructive/20 flex items-center gap-2">
          <AlertTriangle size={15} className="text-destructive" />
          <h2 className="text-sm font-semibold text-destructive">Zone de danger</h2>
        </div>
        <div className="p-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Réinitialiser toutes les données</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supprime tous les casques, vidéos, playlists et l'historique de sync. Cette action est irréversible.
            </p>
          </div>
          <button
            onClick={handleReset}
            className={cn(
              "shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95",
              confirmReset
                ? "bg-destructive text-white animate-pulse"
                : "border border-destructive/40 text-destructive hover:bg-destructive/10"
            )}
          >
            <RotateCcw size={13} />
            {confirmReset ? "Confirmer ?" : "Réinitialiser"}
          </button>
        </div>
      </section>
    </div>
  );
}
