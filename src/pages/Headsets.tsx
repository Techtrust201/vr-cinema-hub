import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Headset, Plus, Battery, HardDrive, Wifi, WifiOff, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HeadsetRow {
  id: string;
  name: string;
  serial: string | null;
  model: string | null;
  status: "pending" | "active" | "revoked";
  last_seen_at: string | null;
  storage_free_bytes: number | null;
  storage_total_bytes: number | null;
  battery_percent: number | null;
  app_version: string | null;
  paired_at: string | null;
  desired_manifest_version?: number;
  applied_manifest_version?: number;
  last_sync_status?: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function onlineStatus(iso: string | null): "online" | "recent" | "offline" {
  if (!iso) return "offline";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 10 * 60 * 1000) return "online";
  if (diff < 24 * 60 * 60 * 1000) return "recent";
  return "offline";
}

function fmtBytes(b: number | null) {
  if (!b) return "—";
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function Headsets() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [list, setList] = useState<HeadsetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairOpen, setPairOpen] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("headsets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erreur: " + error.message);
    else setList((data ?? []) as HeadsetRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchList();
    const ch = supabase
      .channel("headsets-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "headsets" }, () => fetchList())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchList]);

  async function revoke(id: string, name: string) {
    if (!confirm(`Retirer le casque "${name}" ? Il devra être ré-appairé.`)) return;
    const { error } = await supabase.from("headsets").update({ status: "revoked" }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Casque retiré");
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Supprimer définitivement "${name}" ?`)) return;
    const { error } = await supabase.from("headsets").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Supprimé");
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Casques</h1>
          <p className="text-sm text-muted-foreground">Suivi en temps réel des casques déployés.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setPairOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white font-medium hover:opacity-90 transition"
          >
            <Plus size={16} /> Appairer un casque
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" size={16} /> Chargement…
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-xl">
          <Headset className="mx-auto mb-3 text-muted-foreground/50" size={32} />
          <p className="text-muted-foreground">Aucun casque appairé.</p>
          {isAdmin && <p className="text-xs text-muted-foreground/60 mt-1">Cliquez sur « Appairer un casque » pour commencer.</p>}
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((h) => {
            const st = onlineStatus(h.last_seen_at);
            return (
              <div key={h.id} className="p-4 rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))] flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  st === "online" && "bg-[hsl(140_70%_40%_/_0.15)] text-[hsl(140_70%_55%)]",
                  st === "recent" && "bg-[hsl(35_90%_55%_/_0.15)] text-[hsl(35_90%_55%)]",
                  st === "offline" && "bg-muted/60 text-muted-foreground",
                )}>
                  {st === "offline" ? <WifiOff size={16} /> : <Wifi size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{h.name}</p>
                    {h.status === "revoked" && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-destructive/15 text-destructive">RÉVOQUÉ</span>
                    )}
                    {h.status === "pending" && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">EN ATTENTE</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {h.model ?? "Modèle inconnu"}{h.serial ? ` • ${h.serial}` : ""}{h.app_version ? ` • v${h.app_version}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Vu {formatRelative(h.last_seen_at)}</p>
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
                {isAdmin && (
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

      {pairOpen && <PairModal onClose={() => setPairOpen(false)} onDone={fetchList} />}
    </div>
  );
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
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Erreur d'appairage");
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
            Allume le casque, lance l'app VR. Un code à 6 chiffres s'affichera. Saisis-le ici avec un nom pour ce casque.
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