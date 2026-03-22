import { useState, useEffect } from "react";
import { useVRStore } from "@/store/vrStore";
import { Switch } from "@/components/ui/switch";
import { checkServer, isLovablePreview } from "@/lib/serverApi";
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
  FlaskConical,
  Globe,
  ExternalLink,
  MonitorPlay,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { settings, updateSettings, resetStore, loadDemoData, setRealModeData } = useVRStore();
  const [form, setForm] = useState({ ...settings });
  const [showToken, setShowToken] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saved, setSaved] = useState(false);

  // Server connection test — skip auto-check in the Lovable hosted preview (no local proxy)
  const [serverStatus, setServerStatus] = useState<"idle" | "checking" | "connected" | "disconnected">(
    isLovablePreview() ? "disconnected" : "idle"
  );

  const isDirty =
    form.videoStoragePath !== settings.videoStoragePath ||
    form.maxUploadGB !== settings.maxUploadGB ||
    form.authToken !== settings.authToken ||
    form.serverUrl !== settings.serverUrl ||
    form.publicServerUrl !== settings.publicServerUrl ||
    form.demoMode !== settings.demoMode;

  // Auto-check server status on mount — skip in Lovable preview (no local proxy available)
  useEffect(() => {
    if (isLovablePreview()) return;
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
    setForm({ videoStoragePath: "/videos/vr-ultimate", maxUploadGB: 10, authToken: "", serverUrl: "http://localhost:3001", publicServerUrl: "", demoMode: true });
    setConfirmReset(false);
    toast.success("Données réinitialisées");
  };

  const handleTestServer = async (url?: string) => {
    // Use public URL if provided, otherwise use local URL
    const target = url ?? (form.publicServerUrl.trim() || form.serverUrl);
    if (!target.trim()) return;
    setServerStatus("checking");
    // For public URL, pass it as baseUrl; for local URL in non-preview, use relative /api
    const isPublic = target.startsWith("http") && !target.includes("localhost");
    const status = await checkServer(isPublic ? target : undefined);
    setServerStatus(status === "connected" ? "connected" : "disconnected");
    if (status === "connected") {
      toast.success("Serveur connecté ✓");
    } else {
      toast.error("Serveur non disponible — mode simulation actif");
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

      {/* ── MODE DE FONCTIONNEMENT ── */}
      <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
          <MonitorPlay size={15} className="text-[hsl(var(--vr-violet))]" />
          <h2 className="text-sm font-semibold">Mode de fonctionnement</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Toggle démo / réel */}
          <div className={cn(
            "rounded-xl border-2 p-4 transition-all duration-300",
            form.demoMode
              ? "border-[hsl(var(--vr-violet)_/_0.4)] bg-[hsl(var(--vr-violet)_/_0.06)]"
              : "border-[hsl(140_70%_40%_/_0.4)] bg-[hsl(140_70%_40%_/_0.05)]"
          )}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  form.demoMode
                    ? "bg-[hsl(var(--vr-violet)_/_0.15)]"
                    : "bg-[hsl(140_70%_40%_/_0.12)]"
                )}>
                  {form.demoMode
                    ? <FlaskConical size={18} className="text-[hsl(var(--vr-violet))]" />
                    : <Zap size={18} className="text-[hsl(140_70%_55%)]" />
                  }
                </div>
                <div>
                  <p className={cn(
                    "text-sm font-semibold",
                    form.demoMode ? "text-[hsl(var(--vr-violet))]" : "text-[hsl(140_70%_55%)]"
                  )}>
                    {form.demoMode ? "Mode Démo" : "Mode Réel"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {form.demoMode
                      ? "Données fictives — aucun serveur requis"
                      : "ADB live — serveur local requis"}
                  </p>
                </div>
              </div>
              <Switch
                checked={!form.demoMode}
                onCheckedChange={(checked) => {
                  const newDemoMode = !checked;
                  setForm({ ...form, demoMode: newDemoMode });
                  // Applique immédiatement — pas besoin de cliquer Sauvegarder
                  updateSettings({ demoMode: newDemoMode });
                  if (newDemoMode) {
                    // Retour en Mode Démo → recharge les données fictives
                    loadDemoData();
                    toast.info("Mode Démo activé — données fictives restaurées");
                  } else {
                    // Passage en Mode Réel → vide toutes les fausses données
                    setRealModeData();
                    toast.success("Mode Réel activé — démarrez npm run dev:all et branchez vos casques");
                  }
                }}
              />
            </div>
          </div>

          {/* Explication des deux modes */}
          <div className="grid grid-cols-2 gap-3">
            <div className={cn(
              "rounded-lg p-3 border text-xs space-y-1 transition-all",
              form.demoMode
                ? "border-[hsl(var(--vr-violet)_/_0.35)] bg-[hsl(var(--vr-violet)_/_0.06)]"
                : "border-border/40 bg-background/40 opacity-50"
            )}>
              <p className="font-semibold text-[hsl(var(--vr-violet))] flex items-center gap-1.5">
                <FlaskConical size={11} /> Mode Démo (OFF)
              </p>
              <ul className="space-y-0.5 text-muted-foreground/80">
                <li>• Données fictives intégrées</li>
                <li>• Simulation ADB sans casque</li>
                <li>• Aucun serveur à démarrer</li>
                <li>• Idéal pour découverte</li>
              </ul>
            </div>
            <div className={cn(
              "rounded-lg p-3 border text-xs space-y-1 transition-all",
              !form.demoMode
                ? "border-[hsl(140_70%_40%_/_0.35)] bg-[hsl(140_70%_40%_/_0.05)]"
                : "border-border/40 bg-background/40 opacity-50"
            )}>
              <p className="font-semibold text-[hsl(140_70%_55%)] flex items-center gap-1.5">
                <Zap size={11} /> Mode Réel (ON)
              </p>
              <ul className="space-y-0.5 text-muted-foreground/80">
                <li>• Casques ADB détectés en live</li>
                <li>• Push vidéos réel avec spawn</li>
                <li>• Logs SSE en temps réel</li>
                <li>• Requiert <code className="font-mono">npm run dev:all</code></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

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
          </div>

          {/* Public / ngrok URL */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Globe size={12} />
              URL publique (ngrok) <span className="text-muted-foreground/50 font-normal">— optionnel</span>
            </label>
            <input
              type="text"
              value={form.publicServerUrl}
              onChange={(e) => setForm({ ...form, publicServerUrl: e.target.value })}
              placeholder="https://xxxx-xx-xx-xx-xx.ngrok-free.app"
              className={cn(inputCls, "font-mono text-[13px]")}
            />
            <p className="text-[11px] text-muted-foreground/60">
              Permet d'atteindre votre serveur local depuis le preview Lovable. Collez l'URL affichée par <code className="font-mono bg-background px-1 rounded">ngrok http 3001</code>.
            </p>
            {form.publicServerUrl && (
              <a
                href={`${form.publicServerUrl.replace(/\/$/, "")}/api/health`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-[hsl(var(--vr-cyan))] hover:underline"
              >
                <ExternalLink size={10} />
                Tester l'URL dans le navigateur
              </a>
            )}
          </div>

          {/* Setup instructions */}
          <div className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Terminal size={12} />
              Guide de démarrage
            </div>
            <div className="space-y-2">
              {[
                { cmd: "npm run dev:all", desc: "1. Lance Vite :8080 + serveur ADB :3001 en une commande" },
                { cmd: "npm run build && npm start", desc: "2. (prod) Build + tout sur :3001" },
              ].map(({ cmd, desc }) => (
                <div key={cmd} className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground/60">{desc}</p>
                  <code className="block text-[11px] font-mono bg-background px-3 py-1.5 rounded border border-border/40 text-foreground/80 overflow-x-auto whitespace-nowrap">
                    {cmd}
                  </code>
                </div>
              ))}
            </div>
            <div className="rounded border border-[hsl(var(--vr-cyan)_/_0.25)] bg-[hsl(var(--vr-cyan)_/_0.05)] px-3 py-2.5 text-[10px] text-[hsl(var(--vr-cyan))] space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <Globe size={10} />
                Tester depuis le preview Lovable avec ngrok
              </p>
              <code className="block font-mono opacity-80">brew install ngrok/ngrok/ngrok</code>
              <code className="block font-mono opacity-80">ngrok http 3001</code>
              <p className="opacity-70 pt-0.5">Copiez l'URL <code className="font-mono">https://xxxx.ngrok-free.app</code> dans le champ "URL publique" ci-dessus, puis sauvegardez.</p>
            </div>
            <p className="text-[10px] text-muted-foreground/50">
              Sans serveur : simulation active (pas d'ADB réel, pas de lecture vidéo).
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
            Token d'accès serveur (X-Auth-Token)
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
            Envoyé dans le header <code className="font-mono bg-background px-1 rounded">X-Auth-Token</code> à chaque requête. Côté serveur, définissez <code className="font-mono bg-background px-1 rounded">VR_AUTH_TOKEN=votre-token</code> dans votre environnement. Laissez vide pour désactiver.
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

      {/* Demo data */}
      <section className="rounded-xl border border-[hsl(var(--vr-violet)_/_0.3)] bg-[hsl(var(--vr-violet)_/_0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--vr-violet)_/_0.2)] flex items-center gap-2">
          <FlaskConical size={15} className="text-[hsl(var(--vr-violet))]" />
          <h2 className="text-sm font-semibold">Données de démo</h2>
        </div>
        <div className="p-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Charger les données de test</p>
            <p className="text-xs text-muted-foreground mt-1">
              Injecte 9 vidéos VR réalistes, 3 casques Quest avec serials/IPs réels et 4 entrées de sync dans le store. Idéal pour tester toutes les fonctionnalités.
            </p>
            <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground/70 font-mono">
              <li>• 2 playlists Location (Paris, New York) — 5 vidéos 360°/180°</li>
              <li>• 2 playlists Animations — 4 vidéos 180° SBS/OU 8K</li>
              <li>• Quest Pro · Quest 3 · Quest 2 (serials + IP réels)</li>
            </ul>
          </div>
          <button
            onClick={() => { loadDemoData(); toast.success("Données de démo chargées ✓"); }}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 border border-[hsl(var(--vr-violet)_/_0.4)] text-[hsl(var(--vr-violet))] hover:bg-[hsl(var(--vr-violet)_/_0.1)]"
          >
            <FlaskConical size={13} />
            Charger démo
          </button>
        </div>
      </section>

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
              Supprime tous les casques, vidéos, playlists et l'historique de sync. Réinitialise avec les données de démo.
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

