import { PrerequisiteCard } from "../readme/PrerequisiteCard";
import { CodeBlock } from "../readme/CodeBlock";
import { SectionCard } from "../readme/SectionCard";
import { Layers, Zap, Cable, CheckSquare } from "lucide-react";

export const QuickstartSection = () => {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Prérequis</h2>
        <p className="text-muted-foreground">À installer <strong className="text-foreground/80">une seule fois</strong> sur la machine où tourne le dashboard.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <PrerequisiteCard
          icon={Layers}
          title="Node.js v20+"
          description="Le dashboard est une application Next.js. Node.js 20 LTS ou plus est requis. Téléchargeable sur nodejs.org."
          verifyCommand="node -v"
          accentColor="violet"
        />
        <PrerequisiteCard
          icon={Zap}
          title="ffmpeg / ffprobe"
          description="À chaque upload de vidéo, ffprobe détecte automatiquement le format (360° ou 180°) et le mode stéréo."
          verifyCommand="ffprobe -version"
          accentColor="cyan"
        />
        <PrerequisiteCard
          icon={Cable}
          title="ADB (Android Debug Bridge)"
          description='Utilisé pour "pousser" les vidéos et le manifest vers les casques via USB ou Wi-Fi. Inclus dans SideQuest.'
          verifyCommand="adb version"
          accentColor="violet"
        />
        <PrerequisiteCard
          icon={CheckSquare}
          title="Vérification globale"
          description="Une fois les 3 outils installés, vérifiez que les 3 commandes fonctionnent dans un même terminal."
          verifyCommand="node -v && ffprobe -version && adb version"
          accentColor="cyan"
        />
      </div>

      {/* Installation par OS */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Installation de ffmpeg par OS</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <SectionCard>
            <p className="text-xs font-mono text-[hsl(var(--vr-violet))] mb-3 font-semibold uppercase tracking-widest">Linux</p>
            <CodeBlock code="sudo apt install ffmpeg" showPrompt title="terminal" />
          </SectionCard>
          <SectionCard>
            <p className="text-xs font-mono text-[hsl(var(--vr-cyan))] mb-3 font-semibold uppercase tracking-widest">macOS</p>
            <CodeBlock code="brew install ffmpeg" showPrompt title="terminal" />
          </SectionCard>
          <SectionCard>
            <p className="text-xs font-mono text-[hsl(40_90%_55%)] mb-3 font-semibold uppercase tracking-widest">Windows</p>
            <CodeBlock code="choco install ffmpeg" showPrompt title="terminal" />
          </SectionCard>
        </div>
      </div>

      {/* ADB options */}
      <SectionCard>
        <h3 className="text-base font-semibold text-foreground mb-4">Options d'installation ADB</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-[hsl(var(--vr-cyan))] mb-2">Option simple — SideQuest</p>
            <p className="text-sm text-muted-foreground">
              Installer <a href="https://sidequestvr.com" target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--vr-cyan))] hover:underline">SideQuest</a> sur votre PC. Il inclut ADB et une interface pour gérer les casques Quest.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-[hsl(var(--vr-violet))] mb-2">Option manuelle — Android SDK</p>
            <p className="text-sm text-muted-foreground">
              Télécharger les <a href="https://developer.android.com/studio/releases/platform-tools" target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--vr-violet))] hover:underline">Android SDK Platform-Tools</a> et ajouter <code className="font-mono text-xs bg-muted/50 px-1 rounded">platform-tools</code> au PATH.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Final check */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-3">Vérification finale</h3>
        <CodeBlock
          title="Tout vérifier d'un coup"
          code={`node -v\nffprobe -version\nadb version`}
        />
        <p className="text-sm text-muted-foreground mt-3">
          Si les trois commandes retournent une version, vous êtes prêt pour l'installation.
        </p>
      </div>
    </div>
  );
};
