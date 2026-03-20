import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";

interface Phase {
  id: number;
  title: string;
  description: string;
  status: "done" | "todo";
  details?: string[];
  location?: string;
}

const phases: Phase[] = [
  {
    id: 0,
    title: "Setup Unity & prérequis",
    description: "Installer Unity 2022.3 LTS, module Android, compte Meta Developer, SideQuest/ADB, activer le mode développeur sur les Quest.",
    status: "todo",
    location: "Votre PC + casques",
    details: ["Unity 2022.3 LTS + module Android", "Compte Meta Developer (gratuit)", "SideQuest / ADB", "Mode développeur sur chaque Quest"],
  },
  {
    id: 1,
    title: "MVP : Lecteur 360",
    description: "Lecteur 360° de base, pause au retrait du casque (proximity sensor), boucle automatique, contrôle du volume, logo VR Ultimate.",
    status: "todo",
    location: "Projet Unity (scripts C#)",
    details: ["Rendu sphérique 360°", "Pause sur retrait casque", "Boucle & volume", "Splash screen / branding"],
  },
  {
    id: 2,
    title: "Support 180° & environnements",
    description: "Support des vidéos 180° avec écran incurvé, environnements immersifs (nuit étoilée, cinéma VR).",
    status: "todo",
    location: "Projet Unity",
    details: ["Mode 180° / écran incurvé", "Skybox : nuit étoilée", "Skybox : salle cinéma", "Auto-détection format"],
  },
  {
    id: 3,
    title: "Bibliothèques & playlists",
    description: "Navigation entre les deux bibliothèques (Location / Animations), playlists, boucle de playlist, zoom/position 360°, sauvegarde des réglages.",
    status: "todo",
    location: "Projet Unity",
    details: ["Navigation Location / Animations", "Playlists avec boucle", "Zoom & repositionnement 360°", "Persistance réglages (PlayerPrefs)"],
  },
  {
    id: 4,
    title: "Dashboard (déjà fait)",
    description: "Application Next.js avec bibliothèques, playlists, upload, détection 360/180, manifest JSON, sync push via ADB.",
    status: "done",
    location: "Ce dépôt (Next.js)",
    details: ["Bibliothèques Location / Animations", "Upload + détection ffprobe", "Manifest JSON auto-généré", "Sync push ADB ✓"],
  },
  {
    id: 5,
    title: "Sync pull (casques Location)",
    description: "Côté Unity : client qui télécharge le manifest et les vidéos depuis l'URL du dashboard. Configuration Tailscale pour l'accès distant.",
    status: "todo",
    location: "Unity + Tailscale (NAS)",
    details: ["Client HTTP dans Unity", "Téléchargement manifest + vidéos", "Smart diff (hash SHA256)", "Tailscale pour accès distant"],
  },
  {
    id: 6,
    title: "Stabilité & polish",
    description: "Tests multi-casques, gestion d'erreurs robuste, polish UI/UX, documentation finale.",
    status: "todo",
    location: "Unity + Dashboard",
    details: ["Tests simultanés multi-casques", "Gestion erreurs réseau", "Polish UI VR", "Documentation finale"],
  },
];

export const PhaseTimeline = () => {
  return (
    <div className="relative">
      {/* Central line */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 phase-line opacity-40 rounded-full" />

      <div className="space-y-6">
        {phases.map((phase, index) => (
          <div
            key={phase.id}
            className="relative flex gap-6 animate-fade-in-up"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            {/* Node */}
            <div className="relative z-10 flex-shrink-0">
              <div
                className={cn(
                  "w-12 h-12 rounded-full border-2 flex items-center justify-center font-mono font-bold text-sm transition-all",
                  phase.status === "done"
                    ? "bg-[hsl(140_70%_45%_/_0.15)] border-[hsl(140_70%_45%_/_0.6)] text-[hsl(140_70%_60%)] shadow-[0_0_16px_hsl(140_70%_45%_/_0.4)]"
                    : "bg-[hsl(var(--vr-violet)_/_0.1)] border-[hsl(var(--vr-violet)_/_0.4)] text-[hsl(var(--vr-violet))] shadow-[0_0_16px_hsl(var(--vr-violet)_/_0.25)]"
                )}
              >
                {phase.id}
              </div>
            </div>

            {/* Content */}
            <div
              className={cn(
                "flex-1 rounded-xl border p-5 transition-all duration-300 group",
                phase.status === "done"
                  ? "bg-[hsl(140_70%_45%_/_0.05)] border-[hsl(140_70%_45%_/_0.2)] hover:border-[hsl(140_70%_45%_/_0.4)]"
                  : "bg-card border-border/50 hover:border-[hsl(var(--vr-violet)_/_0.4)] hover:shadow-[0_0_20px_hsl(var(--vr-violet)_/_0.08)]"
              )}
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h3 className="font-semibold text-foreground leading-tight">{phase.title}</h3>
                  {phase.location && (
                    <span className="text-xs text-muted-foreground font-mono mt-0.5 block">{phase.location}</span>
                  )}
                </div>
                <StatusBadge status={phase.status} className="shrink-0" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{phase.description}</p>
              {phase.details && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {phase.details.map((detail, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          phase.status === "done"
                            ? "bg-[hsl(140_70%_55%)]"
                            : "bg-[hsl(var(--vr-violet))]"
                        )}
                      />
                      {detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
