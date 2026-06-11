import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Headset { id: string; name: string; last_seen_at: string | null; }
interface SyncReport {
  id: string;
  headset_id: string;
  status: "started" | "success" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  downloaded_count: number;
  failed_count: number;
  deleted_count: number;
  total_bytes: number;
  error_message: string | null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtBytes(b: number) {
  if (!b) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function relAge(iso: string | null) {
  if (!iso) return null;
  return Date.now() - new Date(iso).getTime();
}

export default function Sync() {
  const [reports, setReports] = useState<SyncReport[]>([]);
  const [headsets, setHeadsets] = useState<Record<string, Headset>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [r, h] = await Promise.all([
      supabase.from("sync_reports").select("*").order("started_at", { ascending: false }).limit(100),
      supabase.from("headsets").select("id, name, last_seen_at"),
    ]);
    setReports((r.data ?? []) as SyncReport[]);
    const map: Record<string, Headset> = {};
    for (const x of (h.data ?? []) as Headset[]) map[x.id] = x;
    setHeadsets(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const ch = supabase
      .channel("sync-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_reports" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "headsets" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  const dayMs = 24 * 60 * 60 * 1000;
  const stale = Object.values(headsets).filter((h) => {
    const age = relAge(h.last_seen_at);
    return age === null || age > dayMs;
  });

  if (loading) return <div className="p-6 text-muted-foreground flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suivi des synchronisations</h1>
          <p className="text-sm text-muted-foreground">Temps réel. Les casques se mettent à jour automatiquement.</p>
        </div>
        <button onClick={fetchAll} className="px-3 py-2 text-sm rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition flex items-center gap-2">
          <RefreshCw size={14} /> Rafraîchir
        </button>
      </div>

      {stale.length > 0 && (
        <div className="p-4 rounded-xl border border-[hsl(35_90%_55%_/_0.3)] bg-[hsl(35_90%_55%_/_0.08)]">
          <p className="text-sm font-semibold flex items-center gap-2 text-[hsl(35_90%_55%)]">
            <AlertTriangle size={14} /> {stale.length} casque{stale.length > 1 ? "s" : ""} pas vu{stale.length > 1 ? "s" : ""} depuis plus de 24h
          </p>
          <p className="text-xs text-muted-foreground mt-1">{stale.map((s) => s.name).join(", ")}</p>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-xl text-muted-foreground">
          Aucune synchronisation pour l'instant.
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => {
            const name = headsets[r.headset_id]?.name ?? "Casque supprimé";
            return (
              <div key={r.id} className="flex items-center gap-4 p-3 rounded-lg border border-border/40 bg-[hsl(var(--vr-surface))]">
                <StatusIcon status={r.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtTime(r.started_at)}
                    {r.finished_at && ` → ${fmtTime(r.finished_at)}`}
                  </p>
                  {r.error_message && <p className="text-xs text-destructive mt-1 truncate">{r.error_message}</p>}
                </div>
                <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground font-mono">
                  <span>↓ {r.downloaded_count}</span>
                  {r.failed_count > 0 && <span className="text-destructive">✗ {r.failed_count}</span>}
                  {r.deleted_count > 0 && <span>🗑 {r.deleted_count}</span>}
                  <span>{fmtBytes(r.total_bytes)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: SyncReport["status"] }) {
  const base = "w-8 h-8 rounded-lg flex items-center justify-center shrink-0";
  if (status === "success") return <div className={cn(base, "bg-[hsl(140_70%_40%_/_0.15)] text-[hsl(140_70%_55%)]")}><CheckCircle2 size={16} /></div>;
  if (status === "failed") return <div className={cn(base, "bg-destructive/15 text-destructive")}><XCircle size={16} /></div>;
  if (status === "partial") return <div className={cn(base, "bg-[hsl(35_90%_55%_/_0.15)] text-[hsl(35_90%_55%)]")}><AlertTriangle size={16} /></div>;
  return <div className={cn(base, "bg-[hsl(var(--vr-violet)_/_0.15)] text-[hsl(var(--vr-violet))]")}><Loader2 className="animate-spin" size={16} /></div>;
}