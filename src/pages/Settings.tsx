import { useState } from "react";
import { useVRStore } from "@/store/vrStore";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { settings, updateSettings, resetStore } = useVRStore();
  const [form, setForm] = useState({ ...settings });
  const [showToken, setShowToken] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    form.videoStoragePath !== settings.videoStoragePath ||
    form.maxUploadGB !== settings.maxUploadGB ||
    form.authToken !== settings.authToken;

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
    setForm({ videoStoragePath: "/videos/vr-ultimate", maxUploadGB: 10, authToken: "" });
    setConfirmReset(false);
    toast.success("Données réinitialisées");
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
              Répertoire local ou réseau où sont stockées les vidéos source.
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
            Token utilisé pour sécuriser l'accès au dashboard. Laissez vide pour désactiver.
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
              Remet les bibliothèques, casques et historique de sync à leurs valeurs par défaut. Cette action est irréversible.
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
