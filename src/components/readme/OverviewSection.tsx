import { StatusBadge } from "../readme/StatusBadge";
import { SectionCard } from "../readme/SectionCard";
import { Monitor, Headset, LayoutDashboard, Wifi } from "lucide-react";

const statusRows = [
  {
    label: "Dashboard Next.js",
    description: "Bibliothèques, playlists, upload, détection 360/180, manifest",
    status: "done" as const,
  },
  {
    label: "Sync push (ADB)",
    description: "Envoyer les vidéos du dashboard vers les casques connectés",
    status: "done" as const,
  },
  {
    label: "App VR sur le casque",
    description: "Lecteur, pause capteur, 180°, playlists, zoom…",
    status: "todo" as const,
  },
  {
    label: "Sync pull",
    description: "Le casque télécharge les vidéos depuis le dashboard (Location)",
    status: "todo" as const,
  },
  {
    label: "Tailscale (accès distant)",
    description: "Accès sécurisé au dashboard depuis l'extérieur",
    status: "todo" as const,
  },
];

export const OverviewSection = () => {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center pt-4 pb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[hsl(var(--vr-violet)_/_0.3)] bg-[hsl(var(--vr-violet)_/_0.07)] text-[hsl(var(--vr-violet))] text-sm font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-[hsl(var(--vr-violet))] animate-pulse-glow" />
          Meta Quest 2 / 3 · Lecteur 360° / 180°
        </div>
        <h1 className="text-5xl md:text-6xl font-bold mb-4 leading-[1.05] tracking-tight">
          <span className="gradient-text text-glow-violet">VR Ultimate</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Application VR privée type Skybox — deux bibliothèques (Location / Animations), synchronisation depuis un dashboard web, lecteur immersif sur Meta Quest.
        </p>
      </div>

      {/* Two columns */}
      <div className="grid md:grid-cols-2 gap-5">
        <SectionCard glowColor="cyan" className="animate-fade-in-up delay-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-[hsl(var(--vr-cyan)_/_0.12)] flex items-center justify-center">
              <LayoutDashboard size={18} className="text-[hsl(var(--vr-cyan))]" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Dashboard Web</h2>
              <StatusBadge status="done" className="mt-0.5" />
            </div>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "Gérer les bibliothèques Location & Animations",
              "Créer des playlists, ajouter des vidéos par drag & drop",
              "Détection automatique 360° / 180° via ffprobe",
              "Génération automatique du manifest JSON",
              "Synchronisation push vers les Quest (ADB)",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--vr-cyan))] mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard glowColor="violet" className="animate-fade-in-up delay-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-[hsl(var(--vr-violet)_/_0.12)] flex items-center justify-center">
              <Headset size={18} className="text-[hsl(var(--vr-violet))]" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">App VR (Unity)</h2>
              <StatusBadge status="todo" label="À développer" className="mt-0.5" />
            </div>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "Lecteur 360° / 180° natif sur Quest",
              "Pause automatique au retrait du casque",
              "Navigation entre bibliothèques & playlists",
              "Zoom, repositionnement, boucle de lecture",
              "Mode pull : téléchargement des vidéos depuis le dashboard",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--vr-violet))] mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* Status table */}
      <div className="animate-fade-in-up delay-300">
        <h2 className="text-xl font-semibold mb-4 text-foreground">État du projet</h2>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(240_10%_7%)] border-b border-border/50">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Élément</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">État</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/30 transition-colors hover:bg-[hsl(var(--vr-violet)_/_0.03)]"
                >
                  <td className="px-5 py-3.5 font-medium text-foreground/90">{row.label}</td>
                  <td className="px-5 py-3.5 text-muted-foreground hidden sm:table-cell">{row.description}</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two types of headsets */}
      <div className="grid sm:grid-cols-2 gap-5 animate-fade-in-up delay-400">
        <SectionCard className="border-[hsl(var(--vr-cyan)_/_0.2)]">
          <div className="flex items-center gap-2 mb-2">
            <Wifi size={16} className="text-[hsl(var(--vr-cyan))]" />
            <h3 className="font-semibold text-[hsl(var(--vr-cyan))]">Casques Location</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Chez les clients, synchronisation à distance via Wi-Fi. Mode <strong className="text-foreground/70">pull</strong> : le casque télécharge depuis le dashboard. À implémenter dans l'app Unity + Tailscale.
          </p>
        </SectionCard>
        <SectionCard className="border-[hsl(var(--vr-violet)_/_0.2)]">
          <div className="flex items-center gap-2 mb-2">
            <Monitor size={16} className="text-[hsl(var(--vr-violet))]" />
            <h3 className="font-semibold text-[hsl(var(--vr-violet))]">Casques Animations</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Sur site avec vous, synchronisation en <strong className="text-foreground/70">push</strong> : le dashboard envoie les fichiers via USB ou Wi-Fi local (ADB). <strong className="text-[hsl(140_70%_55%)]">Déjà fonctionnel.</strong>
          </p>
        </SectionCard>
      </div>
    </div>
  );
};
