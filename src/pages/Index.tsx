import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Library, Headset, ListVideo, FolderTree, ArrowRight, RefreshCw } from "lucide-react";

type Counts = { videos: number; headsets: number; playlists: number; groups: number; lastSync: string | null };

export default function Index() {
  const [c, setC] = useState<Counts>({ videos: 0, headsets: 0, playlists: 0, groups: 0, lastSync: null });

  useEffect(() => {
    (async () => {
      const [v, h, p, g, s] = await Promise.all([
        supabase.from("videos").select("id", { count: "exact", head: true }),
        supabase.from("headsets").select("id", { count: "exact", head: true }),
        supabase.from("playlists").select("id", { count: "exact", head: true }),
        supabase.from("headset_groups").select("id", { count: "exact", head: true }),
        supabase.from("sync_reports").select("finished_at").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setC({
        videos: v.count ?? 0,
        headsets: h.count ?? 0,
        playlists: p.count ?? 0,
        groups: g.count ?? 0,
        lastSync: s.data?.finished_at ?? null,
      });
    })();
  }, []);

  const cards = [
    { to: "/libraries", icon: Library, label: "Vidéos", value: c.videos },
    { to: "/headsets", icon: Headset, label: "Casques", value: c.headsets },
    { to: "/playlists", icon: ListVideo, label: "Playlists", value: c.playlists },
    { to: "/groups", icon: FolderTree, label: "Groupes", value: c.groups },
  ];

  const quickLinks = [
    { to: "/libraries", label: "Uploader des vidéos", sub: "Ajouter du contenu à diffuser" },
    { to: "/headsets", label: "Appairer un casque", sub: "Connecter un Quest au dashboard" },
    { to: "/playlists", label: "Créer une playlist", sub: "Grouper des vidéos pour diffusion" },
    { to: "/sync", label: "Suivre la synchro", sub: "Voir ce que les casques téléchargent" },
  ];

  return (
    <div className="p-6 md:p-8 space-y-8 animate-fade-in-up">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Plateforme OTA — les casques se synchronisent automatiquement par internet.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(({ to, icon: Icon, label, value }) => (
          <Link
            key={to}
            to={to}
            className="group p-4 rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] hover:border-[hsl(var(--vr-violet)_/_0.5)] transition-colors"
          >
            <Icon size={18} className="text-[hsl(var(--vr-violet))]" />
            <p className="text-2xl font-bold tabular-nums mt-2">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-4 flex items-center gap-3">
        <RefreshCw size={16} className="text-[hsl(var(--vr-cyan))]" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Dernière synchronisation reçue</p>
          <p className="text-sm font-medium font-mono">
            {c.lastSync ? new Date(c.lastSync).toLocaleString("fr-FR") : "Aucune pour l'instant"}
          </p>
        </div>
        <Link to="/sync" className="text-xs text-[hsl(var(--vr-violet))] hover:underline flex items-center gap-1">
          Voir <ArrowRight size={12} />
        </Link>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {quickLinks.map((q) => (
          <Link
            key={q.to}
            to={q.to}
            className="p-4 rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] hover:border-[hsl(var(--vr-violet)_/_0.5)] transition-colors flex items-center justify-between gap-3"
          >
            <div>
              <p className="font-medium text-sm">{q.label}</p>
              <p className="text-xs text-muted-foreground">{q.sub}</p>
            </div>
            <ArrowRight size={14} className="text-muted-foreground" />
          </Link>
        ))}
      </section>
    </div>
  );
}