import { PhaseTimeline } from "../readme/PhaseTimeline";
import { SectionCard } from "../readme/SectionCard";
import { Layers, Target } from "lucide-react";

export const PhasesSection = () => {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Phases de développement Unity</h2>
        <p className="text-muted-foreground">Roadmap complète pour l'application VR sur Meta Quest.</p>
      </div>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        <SectionCard className="border-[hsl(140_70%_45%_/_0.25)] bg-[hsl(140_70%_45%_/_0.04)]">
          <div className="flex items-center gap-2 mb-2">
            <Target size={16} className="text-[hsl(140_70%_55%)]" />
            <p className="text-sm font-medium text-[hsl(140_70%_55%)]">Déjà fait</p>
          </div>
          <p className="text-sm text-muted-foreground">Phase 4 — Dashboard Next.js complet avec sync push ADB.</p>
        </SectionCard>
        <SectionCard className="border-[hsl(var(--vr-violet)_/_0.25)] bg-[hsl(var(--vr-violet)_/_0.04)]">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={16} className="text-[hsl(var(--vr-violet))]" />
            <p className="text-sm font-medium text-[hsl(var(--vr-violet))]">À développer</p>
          </div>
          <p className="text-sm text-muted-foreground">6 phases Unity restantes — avec Cursor + Unity 2022.3 LTS.</p>
        </SectionCard>
      </div>

      {/* Timeline */}
      <PhaseTimeline />

      {/* Workflow note */}
      <SectionCard className="border-[hsl(var(--vr-cyan)_/_0.2)]">
        <p className="text-sm font-medium text-[hsl(var(--vr-cyan))] mb-2">💡 Comment procéder</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Suivez les phases dans l'ordre avec <strong className="text-foreground/70">Cursor + Unity 2022.3 LTS</strong>. 
          Chaque phase génère des scripts C# à importer dans votre projet Unity. Consultez le fichier de plan 
          <code className="font-mono text-xs bg-muted/50 px-1.5 mx-1 rounded">vr_ultimate_application.plan.md</code> 
          dans Cursor pour les détails d'implémentation.
        </p>
      </SectionCard>
    </div>
  );
};
