import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { HardDrive, Video, CheckCircle2, XCircle } from "lucide-react";

const VIOLET = "hsl(262 83% 70%)";
const CYAN = "hsl(186 100% 60%)";
const RED = "hsl(0 70% 60%)";

function fmtBytes(b: number) {
  if (!b) return "0 B";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function Stats() {
  const [videos, setVideos] = useState<{ format: string | null; size_bytes: number | null }[]>([]);
  const [reports, setReports] = useState<{ status: string; finished_at: string | null; downloaded_count: number; failed_count: number; total_bytes: number }[]>([]);

  useEffect(() => {
    (async () => {
      const [v, r] = await Promise.all([
        supabase.from("videos").select("format, size_bytes"),
        supabase.from("sync_reports").select("status, finished_at, downloaded_count, failed_count, total_bytes").order("finished_at", { ascending: false }).limit(30),
      ]);
      setVideos(v.data ?? []);
      setReports(r.data ?? []);
    })();
  }, []);

  const totalSize = videos.reduce((a, v) => a + (v.size_bytes ?? 0), 0);
  const successCount = reports.filter((r) => r.status === "success").length;
  const failedCount = reports.filter((r) => r.status === "failed" || r.status === "partial").length;

  const formatBreakdown = Object.entries(
    videos.reduce<Record<string, number>>((acc, v) => {
      const k = v.format || "inconnu";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const syncChart = [...reports].reverse().map((r, i) => ({
    i: i + 1,
    downloaded: r.downloaded_count,
    failed: r.failed_count,
  }));

  const cards = [
    { icon: Video, label: "Vidéos", value: videos.length, color: VIOLET },
    { icon: HardDrive, label: "Stockage", value: fmtBytes(totalSize), color: CYAN },
    { icon: CheckCircle2, label: "Syncs OK", value: successCount, color: "hsl(140 70% 55%)" },
    { icon: XCircle, label: "Syncs KO", value: failedCount, color: RED },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 animate-fade-in-up">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Statistiques</h1>
        <p className="text-sm text-muted-foreground mt-1">Vue d'ensemble du contenu et de la synchronisation.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="p-4 rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))]">
            <Icon size={16} style={{ color }} />
            <p className="text-2xl font-bold tabular-nums mt-2">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-5">
          <h2 className="text-sm font-semibold mb-4">Formats des vidéos</h2>
          {formatBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">Aucune vidéo</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={formatBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {formatBreakdown.map((_, i) => (
                    <Cell key={i} fill={i % 2 === 0 ? VIOLET : CYAN} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--vr-surface))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-5">
          <h2 className="text-sm font-semibold mb-4">Historique sync (30 derniers)</h2>
          {syncChart.length === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">Aucune synchronisation</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={syncChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="i" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--vr-surface))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="downloaded" fill={VIOLET} radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill={RED} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    </div>
  );
}