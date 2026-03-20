import { SectionCard } from "../readme/SectionCard";
import { CodeBlock } from "../readme/CodeBlock";
import { Library, Cpu, RefreshCw, Upload, FolderOpen, Wifi } from "lucide-react";

const libraryFeatures = [
  { icon: FolderOpen, label: "Deux bibliothèques", desc: "Location (chez clients) et Animations (sur site)" },
  { icon: Upload, label: "Drag & Drop", desc: "Glissez vos vidéos sur la zone de la playlist" },
  { icon: Cpu, label: "Détection auto", desc: "ffprobe analyse 360°/180° et mode stéréo à l'upload" },
];

export const DashboardSection = () => {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Utiliser le dashboard</h2>
        <p className="text-muted-foreground">Le dashboard est accessible à <code className="font-mono text-sm text-[hsl(var(--vr-cyan))] bg-[hsl(var(--vr-cyan)_/_0.08)] px-1.5 rounded">http://localhost:3000</code> après <code className="font-mono text-sm text-[hsl(var(--vr-violet))] bg-[hsl(var(--vr-violet)_/_0.08)] px-1.5 rounded">npm run dev</code>.</p>
      </div>

      {/* Bibliothèques */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--vr-violet)_/_0.12)] flex items-center justify-center">
            <Library size={16} className="text-[hsl(var(--vr-violet))]" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Bibliothèques <code className="font-mono text-sm text-muted-foreground">/libraries</code></h3>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          {libraryFeatures.map(({ icon: Icon, label, desc }, i) => (
            <SectionCard key={i} glowColor="violet" className="p-4">
              <div className="w-8 h-8 rounded-lg bg-[hsl(var(--vr-violet)_/_0.1)] flex items-center justify-center mb-3">
                <Icon size={16} className="text-[hsl(var(--vr-violet))]" />
              </div>
              <p className="text-sm font-medium text-foreground/90">{label}</p>
              <p className="text-xs text-muted-foreground mt-1">{desc}</p>
            </SectionCard>
          ))}
        </div>
        <SectionCard>
          <p className="text-sm font-medium text-foreground mb-3">Structure de stockage des vidéos</p>
          <div className="font-mono text-xs text-muted-foreground space-y-1 leading-relaxed">
            <div><span className="text-[hsl(var(--vr-cyan))]">data/videos/</span></div>
            <div className="pl-4"><span className="text-foreground/60">├──</span> <span className="text-[hsl(var(--vr-violet))]">location/</span></div>
            <div className="pl-8"><span className="text-foreground/60">│   └──</span> <span className="text-foreground/70">MaPlaylist/</span></div>
            <div className="pl-12"><span className="text-foreground/60">│       └──</span> video.mp4</div>
            <div className="pl-4"><span className="text-foreground/60">└──</span> <span className="text-[hsl(var(--vr-violet))]">animations/</span></div>
            <div className="pl-8"><span className="text-foreground/60">    └──</span> <span className="text-foreground/70">MaPlaylist/</span></div>
            <div className="pl-12"><span className="text-foreground/60">        └──</span> video.mp4</div>
          </div>
        </SectionCard>
      </div>

      {/* Casques */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--vr-cyan)_/_0.12)] flex items-center justify-center">
            <Wifi size={16} className="text-[hsl(var(--vr-cyan))]" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Casques <code className="font-mono text-sm text-muted-foreground">/devices</code></h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <SectionCard glowColor="cyan">
            <p className="text-sm font-medium text-[hsl(var(--vr-cyan))] mb-2">Connexion USB</p>
            <ol className="space-y-1.5 text-sm text-muted-foreground">
              {[
                "Créer un compte Meta Developer (gratuit)",
                "Activer le mode développeur sur le Quest",
                "Brancher via USB et accepter « Autoriser le débogage »",
                "Vérifier avec adb devices",
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[hsl(var(--vr-cyan)_/_0.15)] text-[hsl(var(--vr-cyan))] text-xs flex items-center justify-center mt-0.5">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </SectionCard>
          <SectionCard>
            <p className="text-sm font-medium text-foreground mb-2">Vérification ADB</p>
            <CodeBlock code="adb devices" title="terminal" />
            <p className="text-xs text-muted-foreground mt-2">Le casque doit apparaître avec l'état <code className="font-mono text-[hsl(140_70%_55%)]">device</code>. Ensuite, rafraîchir la page /devices du dashboard.</p>
          </SectionCard>
        </div>
      </div>

      {/* Sync */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--vr-violet)_/_0.12)] flex items-center justify-center">
            <RefreshCw size={16} className="text-[hsl(var(--vr-violet))]" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Sync <code className="font-mono text-sm text-muted-foreground">/sync</code></h3>
        </div>
        <SectionCard glowColor="violet">
          <ol className="space-y-3">
            {[
              { title: "Préparer le contenu", desc: "Dans /libraries, avoir au moins une playlist avec des vidéos" },
              { title: "Connecter le casque", desc: "USB ou Wi-Fi ADB (voir section Casques)" },
              { title: "Choisir la bibliothèque", desc: "Location ou Animations" },
              { title: "Choisir un casque", desc: 'Un casque précis ou "Tous les casques"' },
              { title: "Lancer la sync", desc: "Le dashboard compare les fichiers (smart diff) et n'envoie que les nouveaux" },
            ].map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--vr-violet)_/_0.15)] text-[hsl(var(--vr-violet))] text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <div>
                  <span className="text-sm font-medium text-foreground">{s.title}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>
        <div>
          <p className="text-sm text-muted-foreground mb-3">Vérifier les fichiers sur le casque après sync :</p>
          <CodeBlock
            title="terminal"
            code={`adb shell ls /sdcard/Android/data/com.vrultimate.app/files/Videos/location/\nadb shell ls /sdcard/Android/data/com.vrultimate.app/files/Videos/animations/`}
          />
        </div>
      </div>
    </div>
  );
};
