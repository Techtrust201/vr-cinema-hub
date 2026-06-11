import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, RefreshCw, Clock, WifiOff, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Headset {
  id: string;
  name: string;
  status: "pending" | "active" | "revoked";
  last_seen_at: string | null;
  last_manifest_at: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  desired_manifest_version: number;
  applied_manifest_version: number;
}
interface SyncReport {
  id: string;
  headset_id: string;
  status: "started" | "success" | "partial" | "failed" | "no_change" | "pending";
  started_at: string;
  finished_at: string | null;
  downloaded_count: number;
  failed_count: number;
  deleted_count: number;
  total_bytes: number;
  error_message: string | null;
  applied_manifest_version: number | null;
  playlist_id: string | null;
  remote_video_count: number | null;
  local_video_count: number | null;
  visible_video_count: number | null;
  cause: string | null;
}

type HeadsetSyncState = "up_to_date" | "pending" | "syncing" | "error" | "offline" | "never";

function headsetState(h: Headset): HeadsetSyncState {
  const seenAge = h.last_seen_at ? Date.now() - new Date(h.last_seen_at).getTime() : Infinity;
  const offline = seenAge > 10 * 60 * 1000;
  if (h.desired_manifest_version === 0 && !h.last_sync_at) return offline ? "offline" : "never";
  if (h.last_sync_status === "failed") return "error";
  if (h.last_sync_status === "started") return "syncing";
  if (h.applied_manifest_version < h.desired_manifest_version) return offline ? "offline" : "pending";
  return offline ? "offline" : "up_to_date";
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtRel(iso: string | null) {
  if (!iso) return "jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}
function fmtBytes(b: number) {
  if (!b) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function Sync() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<"state" | "history">("state");
  const [reports, setReports] = useState<SyncReport[]>([]);
  const [headsets, setHeadsets] = useState<Headset[]>([]);
  const [loading, setLoading] = useState(true);
  const [forcing, setForcing] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [r, h] = await Promise.all([
      supabase.from("sync_reports").select("*").order("started_at", { ascending: false }).limit(100),
      supabase.from("headsets").select("id, name, status, last_seen_at, last_manifest_at, last_sync_at, last_sync_status, desired_manifest_version, applied_manifest_version").order("name"),
    ]);
    setReports((r.data ?? []) as SyncReport[]);
    setHeadsets((h.data ?? []) as Headset[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const ch = supabase
      .channel("sync-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_reports" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "headsets" }, () => fetchAll())
      .subscribe();
    // periodic refresh so "offline" updates without a DB event
    const t = setInterval(() => fetchAll(), 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [fetchAll]);

  const headsetMap: Record<string, Headset> = {};
  for (const x of headsets) headsetMap[x.id] = x;

  async function forceResync(h: Headset) {
    setForcing((s) => ({ ...s, [h.id]: true }));
    const { error } = await supabase.functions.invoke("headset-force-resync", {
      body: { headset_id: h.id },
    });
    setForcing((s) => ({ ...s, [h.id]: false }));
    if (error) {
      toast.error("Erreur: " + error.message);
    } else {
      toast.success(`Resync demandée pour ${h.name}`);
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Chargement…</div>;

  const activeHeadsets = headsets.filter((h) => h.status === "active");
  const pendingCount = activeHeadsets.filter((h) => h.applied_manifest_version < h.desired_manifest_version).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suivi des synchronisations</h1>
          <p className="text-sm text-muted-foreground">État réel des casques. Le statut "À jour" n'apparaît qu'après confirmation du casque.</p>
        </div>
        <button onClick={fetchAll} className="px-3 py-2 text-sm rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition flex items-center gap-2">
          <RefreshCw size={14} /> Rafraîchir
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-border/50">
        <TabButton active={tab === "state"} onClick={() => setTab("state")}>
          État par casque {pendingCount > 0 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-[hsl(35_90%_55%_/_0.2)] text-[hsl(35_90%_55%)]">{pendingCount}</span>}
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          Historique ({reports.length})
        </TabButton>
      </div>

      {tab === "state" && (
        activeHeadsets.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border/50 rounded-xl text-muted-foreground">
            Aucun casque actif.
          </div>
        ) : (
          <div className="grid gap-2">
            {activeHeadsets.map((h) => {
              const state = headsetState(h);
              return (
                <div key={h.id} className="p-4 rounded-xl border border-border/40 bg-[hsl(var(--vr-surface))] flex items-center gap-4">
                  <StateBadge state={state} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{h.name}</p>
                    <p className="text-xs text-muted-foreground">
                      version casque <span className="font-mono">{h.applied_manifest_version}</span>
                      <span className="mx-1">/</span>
                      version serveur <span className="font-mono">{h.desired_manifest_version}</span>
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Dernier manifest servi : {fmtRel(h.last_manifest_at)} • Dernier report : {fmtRel(h.last_sync_at)}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => forceResync(h)}
                      disabled={forcing[h.id]}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {forcing[h.id] ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                      Forcer resync
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "history" && (
        reports.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border/50 rounded-xl text-muted-foreground">
            Aucune synchronisation pour l'instant.
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => {
              const name = headsetMap[r.headset_id]?.name ?? "Casque supprimé";
              return (
                <div key={r.id} className="flex items-center gap-4 p-3 rounded-lg border border-border/40 bg-[hsl(var(--vr-surface))]">
                  <ReportIcon status={r.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {name}
                      {r.applied_manifest_version != null && (
                        <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">v{r.applied_manifest_version}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtTime(r.started_at)}
                      {r.finished_at && ` → ${fmtTime(r.finished_at)}`}
                      {r.cause && <span className="ml-2 opacity-60">cause: {r.cause}</span>}
                    </p>
                    {r.error_message && <p className="text-xs text-destructive mt-1 truncate">{r.error_message}</p>}
                  </div>
                  <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground font-mono">
                    {r.visible_video_count != null && <span title="visibles dans le casque">👁 {r.visible_video_count}</span>}
                    {r.local_video_count != null && <span title="présentes localement">💾 {r.local_video_count}</span>}
                    <span>↓ {r.downloaded_count}</span>
                    {r.failed_count > 0 && <span className="text-destructive">✗ {r.failed_count}</span>}
                    {r.deleted_count > 0 && <span>🗑 {r.deleted_count}</span>}
                    <span>{fmtBytes(r.total_bytes)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition",
        active
          ? "border-[hsl(var(--vr-violet))] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function StateBadge({ state }: { state: HeadsetSyncState }) {
  const base = "w-10 h-10 rounded-lg flex items-center justify-center shrink-0";
  if (state === "up_to_date") return <div className={cn(base, "bg-[hsl(140_70%_40%_/_0.15)] text-[hsl(140_70%_55%)]")} title="À jour"><CheckCircle2 size={18} /></div>;
  if (state === "pending") return <div className={cn(base, "bg-[hsl(35_90%_55%_/_0.15)] text-[hsl(35_90%_55%)]")} title="En attente"><Clock size={18} /></div>;
  if (state === "syncing") return <div className={cn(base, "bg-[hsl(var(--vr-cyan)_/_0.15)] text-[hsl(var(--vr-cyan))]")} title="Synchronisation"><Loader2 className="animate-spin" size={18} /></div>;
  if (state === "error") return <div className={cn(base, "bg-destructive/15 text-destructive")} title="Erreur"><XCircle size={18} /></div>;
  if (state === "offline") return <div className={cn(base, "bg-muted/60 text-muted-foreground")} title="Hors-ligne"><WifiOff size={18} /></div>;
  return <div className={cn(base, "bg-muted/60 text-muted-foreground")} title="Pas encore synchronisé"><AlertTriangle size={18} /></div>;
}

function ReportIcon({ status }: { status: SyncReport["status"] }) {
  const base = "w-8 h-8 rounded-lg flex items-center justify-center shrink-0";
  if (status === "success") return <div className={cn(base, "bg-[hsl(140_70%_40%_/_0.15)] text-[hsl(140_70%_55%)]")}><CheckCircle2 size={16} /></div>;
  if (status === "no_change") return <div className={cn(base, "bg-[hsl(140_70%_40%_/_0.10)] text-[hsl(140_70%_55%)]")}><CheckCircle2 size={16} /></div>;
  if (status === "failed") return <div className={cn(base, "bg-destructive/15 text-destructive")}><XCircle size={16} /></div>;
  if (status === "partial") return <div className={cn(base, "bg-[hsl(35_90%_55%_/_0.15)] text-[hsl(35_90%_55%)]")}><AlertTriangle size={16} /></div>;
  return <div className={cn(base, "bg-[hsl(var(--vr-violet)_/_0.15)] text-[hsl(var(--vr-violet))]")}><Loader2 className="animate-spin" size={16} /></div>;
}