import { ApiTable } from "../readme/ApiTable";
import { SectionCard } from "../readme/SectionCard";
import { CodeBlock } from "../readme/CodeBlock";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const fileStructure = [
  { depth: 0, name: "vr_ultimate/", type: "dir" },
  { depth: 1, name: "src/", type: "dir" },
  { depth: 2, name: "app/", type: "dir", comment: "Pages Next.js & routes API" },
  { depth: 2, name: "components/", type: "dir", comment: "Composants React" },
  { depth: 2, name: "lib/", type: "dir", comment: "adb, ffprobe, manifest, sync, db" },
  { depth: 2, name: "types/", type: "dir", comment: "Types TypeScript partagés" },
  { depth: 1, name: "prisma/", type: "dir" },
  { depth: 2, name: "schema.prisma", type: "file", comment: "Modèle Library, Playlist, Video" },
  { depth: 2, name: "dev.db", type: "file", comment: "Base SQLite (créée au seed)" },
  { depth: 2, name: "seed.ts", type: "file", comment: "Init bibliothèques" },
  { depth: 1, name: "data/videos/", type: "dir", comment: "Vidéos uploadées" },
  { depth: 1, name: ".env", type: "file", comment: "Configuration (à créer)" },
  { depth: 1, name: "package.json", type: "file" },
  { depth: 1, name: "next.config.ts", type: "file" },
];

const troubleshootItems = [
  {
    q: "« ADB non trouvé » au démarrage",
    a: 'Installer ADB (SideQuest ou Android SDK Platform-Tools). Vérifier que la commande `adb` est dans le PATH du terminal utilisé pour `npm run dev`.',
    code: "adb version",
  },
  {
    q: "Aucun casque sur la page Casques",
    a: "Vérifier avec `adb devices`. Si vide : brancher en USB, accepter « Autoriser le débogage », activer le mode développeur. En Wi-Fi, refaire le pairing.",
    code: "adb devices",
  },
  {
    q: "Erreur lors de l'upload de vidéo",
    a: "Vérifier ffmpeg (`ffprobe -version`). Vérifier l'espace disque dans VIDEO_STORAGE_PATH. Si fichier très gros, augmenter MAX_UPLOAD_SIZE_GB dans .env et redémarrer.",
    code: "ffprobe -version",
  },
  {
    q: "« Bibliothèque introuvable » ou base vide",
    a: "Lancer `npm run db:seed` pour recréer les bibliothèques Location et Animations.",
    code: "npm run db:seed",
  },
  {
    q: "La sync ne copie rien / erreurs ADB",
    a: "Vérifier que le chemin de destination sur le Quest existe. L'app VR le créera au premier lancement. Vérifier les droits d'écriture (stockage de l'app).",
  },
];

export const ReferenceSection = () => {
  const [openTrouble, setOpenTrouble] = useState<number | null>(null);

  return (
    <div className="space-y-12">
      {/* APIs */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">API Reference</h2>
        <p className="text-muted-foreground mb-5">Toutes les routes disponibles. 🔒 = header <code className="font-mono text-xs bg-muted/50 px-1.5 rounded">Authorization: Bearer &lt;token&gt;</code> si DASHBOARD_AUTH_TOKEN est défini.</p>
        <ApiTable />
      </div>

      {/* File structure */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">Structure du projet</h2>
        <SectionCard className="p-0 overflow-hidden">
          <div className="p-4 bg-[hsl(240_10%_7%)] border-b border-border/50 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(0_70%_55%)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(40_90%_55%)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(140_70%_45%)]" />
            <span className="ml-2 text-xs font-mono text-muted-foreground">projet</span>
          </div>
          <div className="p-5 font-mono text-xs space-y-1 leading-6">
            {fileStructure.map((item, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span style={{ paddingLeft: `${item.depth * 20}px` }} className="flex items-center gap-1.5 shrink-0">
                  {item.type === "dir" ? (
                    <span className="text-[hsl(var(--vr-cyan))]">{item.name}</span>
                  ) : (
                    <span className="text-foreground/70">{item.name}</span>
                  )}
                </span>
                {item.comment && (
                  <span className="text-muted-foreground/50">← {item.comment}</span>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Config files */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">Fichiers de configuration importants</h2>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(240_10%_7%)] border-b border-border/50">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Fichier</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Rôle</th>
              </tr>
            </thead>
            <tbody>
              {[
                { file: ".env", role: "Configuration : BDD, dossier vidéos, taille max upload, token auth optionnel" },
                { file: "prisma/dev.db", role: "Base SQLite : bibliothèques, playlists, vidéos (métadonnées)" },
                { file: "data/videos/", role: "Dossiers location/ et animations/, puis par playlist" },
                { file: "prisma/schema.prisma", role: "Modèle de données (Library, Playlist, Video)" },
              ].map((row, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">
                    <code className="font-mono text-xs text-[hsl(var(--vr-violet))] bg-[hsl(var(--vr-violet)_/_0.08)] px-2 py-0.5 rounded">
                      {row.file}
                    </code>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{row.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Troubleshooting */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">Dépannage courant</h2>
        <div className="space-y-2">
          {troubleshootItems.map((item, i) => {
            const isOpen = openTrouble === i;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl border transition-all duration-300",
                  isOpen
                    ? "border-[hsl(var(--vr-cyan)_/_0.4)] bg-[hsl(var(--vr-cyan)_/_0.03)]"
                    : "border-border/50 bg-card hover:border-border"
                )}
              >
                <button
                  onClick={() => setOpenTrouble(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
                >
                  <span className={cn("text-sm font-medium", isOpen ? "text-foreground" : "text-foreground/80")}>
                    {item.q}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 space-y-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                    {item.code && <CodeBlock code={item.code} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
