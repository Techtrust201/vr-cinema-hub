import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLiveData } from "@/hooks/useLiveData";
import { useConfirm } from "@/hooks/useConfirm";
import { Headset, Plus, Battery, HardDrive, Wifi, WifiOff, Trash2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isPermissionError } from "@/lib/supabaseErrors";
import { appContactLabel, appContactState, formatRelativeFr, type AppContactState } from "@/lib/headsetContact";
import { describeReportStatus, describeVersionGap } from "@/lib/syncVocabulary";

interface HeadsetRow {
  id: string;
  name: string;
  serial: string | null;
  model: string | null;
  status: "pending" | "active" | "revoked";
  last_seen_at: string | null;
  last_heartbeat_at: string | null;
  last_manifest_at: string | null;
  last_contact_source: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  storage_free_bytes: number | null;
  storage_total_bytes: number | null;
  battery_percent: number | null;
  app_version: string | null;
  paired_at: string | null;
  desired_manifest_version?: number;
  applied_manifest_version?: number;
  last_sync_status?: string | null;
  last_sync_at?: string | null;
}

function fmtBytes(b: number | null) {
  if (!b) return "—";
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function contactTone(st: AppContactState) {
  if (st === "app_active") return "bg-[hsl(140_70%_40%_/_0.15)] text-[hsl(140_70%_55%)]";
  if (st === "app_recent") return "bg-[hsl(35_90%_55%_/_0.15)] text-[hsl(35_90%_55%)]";
  if (st === "revoked") return "bg-destructive/15 text-destructive";
  return "bg-muted/60 text-muted-foreground";
}

export default function Headsets() {
  const { canManageContent } = useAuth();
  const [pairOpen, setPairOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  // Realtime may be denied by migration; poll as reliable fallback.
  const { data, initialLoading, refreshing, error, refresh, mutate } = useLiveData<HeadsetRow[]>(
    async (signal) => {
      const { data, error } = await supabase
        .from("headsets")
        .select("*")
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      if (error) throw new Error(error.message);
      return (data ?? []) as HeadsetRow[];
    },
    { pollMs: 15_000, realtime: { channel: "headsets-realtime", tables: ["headsets"] } },
  );

  const list = data ?? [];

  async function revoke(id: string, name: string) {
    const ok = await confirm({
      title: `Révoquer « ${name} » ?`,
      description: "L'application VR de ce casque ne pourra plus se synchroniser.",
      confirmLabel: "Révoquer",
      destructive: true,
    });
    if (!ok) return;

    // Optimistic: the badge flips immediately, and rolls back if the write fails.
    mutate((current) =>
      (current ?? []).map((h) => (h.id === id ? { ...h, status: "revoked" as const } : h)),
    );
    const { data: updated, error } = await supabase
      .from("headsets")
      .update({ status: "revoked" })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();
    if (error || !updated || updated.status !== "revoked") {
      void refresh();
      toast.error(
        error && isPermissionError(error)
          ? "Révoquer nécessite des droits de gestion."
          : (error?.message ?? "Révocation non confirmée par la base."),
      );
      return;
    }
    toast.success("Casque révoqué");
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: `Supprimer « ${name} » ?`,
      description: "Cette suppression est définitive et retire le casque de la plateforme.",
      confirmLabel: "Supprimer",
      destructive: true,
    });
    if (!ok) return;

    const previous = list;
    mutate((current) => (current ?? []).filter((h) => h.id !== id));
    const { error } = await supabase.from("headsets").delete().eq("id", id);
    if (error) {
      mutate(() => previous);
      toast.error(isPermissionError(error)
        ? "Suppression refusée : droits insuffisants."
        : error.message);
      return;
    }
    toast.success("Supprimé");
    void refresh();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Casques</h1>
          <p className="text-sm text-muted-foreground">
            Statut = contact de l&apos;application VR avec le serveur (pas l&apos;alimentation physique du casque).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            disabled={refreshing}
            className="p-2 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition disabled:opacity-60"
            title="Rafraîchir"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
          </button>
          {canManageContent && (
            <button
              onClick={() => setPairOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white font-medium hover:opacity-90 transition"
            >
              <Plus size={16} /> Appairer un casque
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <WifiOff size={13} />
          Données peut-être obsolètes — dernière actualisation échouée ({error.message}).
        </div>
      )}

      {initialLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" size={16} /> Chargement…
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-xl">
          <Headset className="mx-auto mb-3 text-muted-foreground/50" size={32} />
          <p className="text-muted-foreground">Aucun casque appairé.</p>
          {canManageContent && <p className="text-xs text-muted-foreground/60 mt-1">Cliquez sur « Appairer un casque » pour commencer.</p>}
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((h) => {
            const st = appContactState(h.status, h.last_seen_at);
            return (
              <div key={h.id} className="p-4 rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))] flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", contactTone(st))}>
                  {st === "app_offline" || st === "never" || st === "revoked" ? <WifiOff size={16} /> : <Wifi size={16} />}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{h.name}</p>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded", contactTone(st))}>
                      {appContactLabel(st)}
                    </span>
                    {h.status === "pending" && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">EN ATTENTE</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {h.model ?? "Modèle inconnu"}{h.serial ? ` • ${h.serial}` : ""}{h.app_version ? ` • app v${h.app_version}` : ""}
                  </p>
                  {/* Le détail des trois horodatages n'intéresse que le support :
                      il reste en infobulle plutôt que d'encombrer la ligne. */}
                  <p
                    className="text-xs text-muted-foreground/80"
                    title={[
                      `Signal de présence ${formatRelativeFr(h.last_heartbeat_at)}`,
                      `Contenu proposé ${formatRelativeFr(h.last_manifest_at)}`,
                      `Compte rendu ${formatRelativeFr(h.last_sync_at ?? null)}`,
                    ].join("\n")}
                  >
                    Dernier contact {formatRelativeFr(h.last_seen_at)}
                    {h.last_sync_status ? ` · ${describeReportStatus(h.last_sync_status)}` : ""}
                  </p>
                  {(h.last_error_code || h.last_error_message) && (
                    <p className="text-xs text-destructive/80">
                      Erreur {h.last_error_code ?? ""}{h.last_error_message ? `: ${h.last_error_message}` : ""}
                    </p>
                  )}
                </div>
                <SyncBadge h={h} />
                <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                  {h.battery_percent != null && (
                    <span className="flex items-center gap-1"><Battery size={12} /> {h.battery_percent}%</span>
                  )}
                  {h.storage_free_bytes != null && (
                    <span className="flex items-center gap-1"><HardDrive size={12} /> {fmtBytes(h.storage_free_bytes)} libres</span>
                  )}
                </div>
                {canManageContent && (
                  <div className="flex items-center gap-1">
                    {h.status === "active" && (
                      <button onClick={() => revoke(h.id, h.name)} className="px-2 py-1 text-xs text-muted-foreground hover:text-destructive transition">Révoquer</button>
                    )}
                    <button onClick={() => remove(h.id, h.name)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pairOpen && <PairModal onClose={() => setPairOpen(false)} onDone={() => void refresh()} />}
      {confirmDialog}
    </div>
  );
}

function SyncBadge({ h }: { h: HeadsetRow }) {
  const desired = h.desired_manifest_version ?? 0;
  const applied = h.applied_manifest_version ?? 0;
  if (h.status !== "active") return null;
  // Les numéros de version ne disent rien à l'exploitant : ils partent en
  // infobulle, et l'étiquette dit seulement si le casque a bien ce qu'il doit avoir.
  const detail = `Version reçue par le casque : ${applied} — version attendue : ${desired}`;
  const base = "hidden md:inline-flex text-[10px] px-2 py-0.5 rounded";
  if (desired === 0 && applied === 0) {
    return <span title={detail} className={cn(base, "bg-muted/60 text-muted-foreground")}>Jamais synchronisé</span>;
  }
  if (h.last_sync_status === "failed") {
    return <span title={detail} className={cn(base, "bg-destructive/15 text-destructive")}>Échec de mise à jour</span>;
  }
  if (applied < desired) {
    return (
      <span title={detail} className={cn(base, "bg-[hsl(35_90%_55%_/_0.15)] text-[hsl(35_90%_55%)]")}>
        {describeVersionGap(applied, desired)}
      </span>
    );
  }
  return <span title={detail} className={cn(base, "bg-[hsl(140_70%_40%_/_0.15)] text-[hsl(140_70%_55%)]")}>À jour</span>;
}

function PairModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("headset-pair-claim", {
      body: { code: code.trim(), name: name.trim() },
    });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error ?? error?.message ?? "Erreur d'appairage");
      return;
    }
    toast.success(`Casque "${name}" appairé !`);
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border/70 bg-[hsl(var(--vr-surface))] p-6 space-y-4"
      >
        <div>
          <h2 className="text-lg font-bold">Appairer un casque</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Allume le casque, lance l&apos;app VR. Un code à 6 chiffres s&apos;affichera. Saisis-le ici avec un nom pour ce casque.
            Le casque n&apos;apparaîtra « Application active » qu&apos;après que l&apos;app ait contacté le serveur.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Code (6 chiffres)</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border/50 font-mono text-center text-lg tracking-widest focus:outline-none focus:border-[hsl(var(--vr-violet))]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Nom du casque</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Salon Paris #1"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border/50 focus:outline-none focus:border-[hsl(var(--vr-violet))]"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition">Annuler</button>
          <button
            type="submit"
            disabled={busy || code.length !== 6 || !name.trim()}
            className="px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition flex items-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Appairer
          </button>
        </div>
      </form>
    </div>
  );
}
