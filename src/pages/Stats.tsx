import { useMemo } from "react";
import { useVRStore } from "@/store/vrStore";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { HardDrive, Trophy, BarChart2, Database } from "lucide-react";

// ─── colour tokens (hsl from design system) ───────────────────────────────
const VIOLET = "hsl(262 83% 70%)";
const CYAN   = "hsl(186 100% 60%)";
const MUTED  = "hsl(215 20% 30%)";

// ─── helpers ──────────────────────────────────────────────────────────────
function formatGB(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)} TB`;
  return `${n.toFixed(1)} GB`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── custom tooltip ───────────────────────────────────────────────────────
function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-[hsl(var(--vr-surface))] px-3 py-2 shadow-xl text-xs">
      <p className="font-mono text-muted-foreground mb-0.5">{label}</p>
      <p className="font-semibold text-[hsl(var(--vr-violet))]">
        {payload[0].value} fichier{payload[0].value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-[hsl(var(--vr-surface))] px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold">{payload[0].name} — {payload[0].value} vidéo{payload[0].value !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ─── Donut component ──────────────────────────────────────────────────────
function DonutCard({ title, data }: { title: string; data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-2xl border border-border/50 bg-[hsl(var(--vr-surface))] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart2 size={14} className="text-[hsl(var(--vr-violet))]" />
        <p className="text-sm font-semibold">{title}</p>
        <span className="ml-auto text-xs text-muted-foreground font-mono tabular-nums">{total} vidéos</span>
      </div>
      <div className="flex items-center gap-6">
        <div className="w-28 h-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={32}
                outerRadius={52}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2.5">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
              <span className="text-xs text-muted-foreground flex-1">{d.name}</span>
              <span className="text-xs font-mono font-semibold tabular-nums">{d.value}</span>
              <span className="text-[10px] text-muted-foreground/60 font-mono w-9 text-right">
                {total > 0 ? `${Math.round((d.value / total) * 100)}%` : "—"}
              </span>
            </div>
          ))}
          {total === 0 && <p className="text-xs text-muted-foreground/50 italic">Aucune vidéo</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function Stats() {
  const { libraries, devices, syncLogs } = useVRStore();

  // ── Donut data per library ──────────────────────────────────────────────
  const donutData = useMemo(() => {
    return libraries.map((lib) => {
      const allVideos = lib.playlists.flatMap((p) => p.videos);
      const count360 = allVideos.filter((v) => v.format === "360").length;
      const count180 = allVideos.filter((v) => v.format === "180").length;
      return {
        id: lib.id,
        name: lib.name,
        data: [
          { name: "360°", value: count360, color: VIOLET },
          { name: "180°", value: count180, color: CYAN },
        ],
      };
    });
  }, [libraries]);

  // ── Bar chart: syncs last 30 days ───────────────────────────────────────
  const barData = useMemo(() => {
    const buckets: Record<string, number> = {};
    // Pre-fill last 30 days
    for (let i = 29; i >= 0; i--) {
      buckets[daysAgo(i)] = 0;
    }
    syncLogs
      .filter((l) => l.status === "success")
      .forEach((l) => {
        const day = l.at.slice(0, 10);
        if (day in buckets) {
          buckets[day] = (buckets[day] || 0) + l.videosPushed;
        }
      });
    return Object.entries(buckets).map(([date, videos]) => ({
      date: date.slice(5), // "MM-DD"
      videos,
    }));
  }, [syncLogs]);

  // ── Top device ──────────────────────────────────────────────────────────
  const topDevice = useMemo(() => {
    const counts: Record<string, number> = {};
    syncLogs
      .filter((l) => l.status === "success")
      .forEach((l) => {
        l.deviceIds.forEach((id) => {
          counts[id] = (counts[id] || 0) + 1;
        });
      });
    const [topId, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const device = devices.find((d) => d.id === topId);
    return device ? { device, count: topCount as number } : null;
  }, [syncLogs, devices]);

  // ── Total data transferred ──────────────────────────────────────────────
  const totalTransferred = useMemo(() => {
    const allVideos = libraries.flatMap((lib) => lib.playlists.flatMap((p) => p.videos));
    const avgSize = allVideos.length > 0
      ? allVideos.reduce((s, v) => s + v.sizeGB, 0) / allVideos.length
      : 3.5;
    return syncLogs
      .filter((l) => l.status === "success")
      .reduce((sum, l) => sum + l.videosPushed * avgSize, 0);
  }, [syncLogs, libraries]);

  // ── Total video size in libraries ───────────────────────────────────────
  const totalLibrarySize = useMemo(() => {
    return libraries.flatMap((lib) => lib.playlists.flatMap((p) => p.videos))
      .reduce((s, v) => s + v.sizeGB, 0);
  }, [libraries]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">Statistiques</h1>
        <p className="text-sm text-muted-foreground">
          Vue d'ensemble des bibliothèques, syncs et appareils.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            icon: <Database size={14} className="text-[hsl(var(--vr-violet))]" />,
            label: "Vidéos totales",
            value: String(
              libraries.flatMap((l) => l.playlists.flatMap((p) => p.videos)).length
            ),
            sub: `${libraries.flatMap((l) => l.playlists).length} playlists`,
          },
          {
            icon: <HardDrive size={14} className="text-[hsl(var(--vr-cyan))]" />,
            label: "Taille bibliothèques",
            value: formatGB(totalLibrarySize),
            sub: "stockage requis",
          },
          {
            icon: <BarChart2 size={14} className="text-[hsl(50_80%_60%)]" />,
            label: "Syncs réussies",
            value: String(syncLogs.filter((l) => l.status === "success").length),
            sub: `${syncLogs.filter((l) => l.status === "error").length} en erreur`,
          },
          {
            icon: <HardDrive size={14} className="text-muted-foreground" />,
            label: "Données transférées",
            value: formatGB(totalTransferred),
            sub: "estimé (syncs OK)",
          },
        ].map(({ icon, label, value, sub }) => (
          <div
            key={label}
            className="rounded-xl border border-border/50 bg-[hsl(var(--vr-surface))] px-4 py-4 space-y-2"
          >
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 font-medium">
              {icon}
              {label}
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
            <p className="text-[11px] text-muted-foreground/60">{sub}</p>
          </div>
        ))}
      </div>

      {/* Donut charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {donutData.map((d) => (
          <DonutCard key={d.id} title={`Répartition — ${d.name}`} data={d.data} />
        ))}
      </div>

      {/* Bar chart */}
      <div className="rounded-2xl border border-border/50 bg-[hsl(var(--vr-surface))] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-[hsl(var(--vr-violet))]" />
          <p className="text-sm font-semibold">Évolution des syncs — 30 derniers jours</p>
          <span className="ml-auto text-[11px] text-muted-foreground font-mono">fichiers poussés / jour</span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} barSize={8} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid
                vertical={false}
                stroke="hsl(215 20% 20%)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(215 15% 45%)", fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(215 15% 45%)" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "hsl(262 83% 70% / 0.06)", radius: 4 }} />
              <Bar dataKey="videos" fill={VIOLET} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row: top device + data stat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top device */}
        <div className="rounded-2xl border border-border/50 bg-[hsl(var(--vr-surface))] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-[hsl(50_80%_60%)]" />
            <p className="text-sm font-semibold">Casque le plus synchronisé</p>
          </div>
          {topDevice ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[hsl(50_80%_50%_/_0.1)] border border-[hsl(50_80%_50%_/_0.25)] flex items-center justify-center text-[hsl(50_80%_60%)] font-bold text-lg">
                #1
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{topDevice.device.name}</p>
                <p className="text-xs font-mono text-muted-foreground/70">{topDevice.device.serial}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5 capitalize">{topDevice.device.type}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold tabular-nums text-[hsl(50_80%_60%)]">{topDevice.count}</p>
                <p className="text-[10px] text-muted-foreground/60">sync{topDevice.count !== 1 ? "s" : ""}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-16 text-sm text-muted-foreground/50 italic">
              Aucune sync réussie
            </div>
          )}
        </div>

        {/* Storage breakdown */}
        <div className="rounded-2xl border border-border/50 bg-[hsl(var(--vr-surface))] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive size={14} className="text-[hsl(var(--vr-cyan))]" />
            <p className="text-sm font-semibold">Stockage par bibliothèque</p>
          </div>
          <div className="space-y-3">
            {libraries.map((lib) => {
              const size = lib.playlists.flatMap((p) => p.videos).reduce((s, v) => s + v.sizeGB, 0);
              const pct = totalLibrarySize > 0 ? (size / totalLibrarySize) * 100 : 0;
              const isLocation = lib.id === "location";
              return (
                <div key={lib.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{lib.name}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{formatGB(size)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-border/40 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: isLocation ? VIOLET : CYAN,
                        boxShadow: `0 0 8px ${isLocation ? VIOLET : CYAN}55`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/50">
                    {lib.playlists.flatMap((p) => p.videos).length} vidéos · {Math.round(pct)}% du total
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
