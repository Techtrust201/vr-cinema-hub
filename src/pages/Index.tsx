import { useState } from "react";
import { cn } from "@/lib/utils";
import { OverviewSection } from "@/components/readme/OverviewSection";
import { QuickstartSection } from "@/components/readme/QuickstartSection";
import { InstallSection } from "@/components/readme/InstallSection";
import { DashboardSection } from "@/components/readme/DashboardSection";
import { PhasesSection } from "@/components/readme/PhasesSection";
import { ReferenceSection } from "@/components/readme/ReferenceSection";

const tabs = [
  { id: "overview", label: "Aperçu", emoji: "🏠" },
  { id: "quickstart", label: "Démarrage", emoji: "⚡" },
  { id: "install", label: "Installation", emoji: "📦" },
  { id: "dashboard", label: "Dashboard", emoji: "🎮" },
  { id: "phases", label: "Phases Unity", emoji: "🚀" },
  { id: "reference", label: "Référence", emoji: "🔧" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="min-h-screen bg-background">
      {/* Background subtle grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--vr-violet)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--vr-violet)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4">
          {/* Brand */}
          <div className="flex items-center justify-between py-3 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-[hsl(var(--vr-violet)_/_0.15)] border border-[hsl(var(--vr-violet)_/_0.3)] flex items-center justify-center">
                <div className="w-3 h-3 rounded-sm bg-[hsl(var(--vr-violet))] shadow-[0_0_8px_hsl(var(--vr-violet)_/_0.7)]" />
              </div>
              <span className="font-bold text-sm tracking-wide gradient-text">VR ULTIMATE</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(140_70%_55%)] animate-pulse-glow" />
                Dashboard actif
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-[hsl(var(--vr-cyan)_/_0.3)] text-[hsl(var(--vr-cyan))] bg-[hsl(var(--vr-cyan)_/_0.06)] font-mono">
                Meta Quest 2/3
              </span>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 shrink-0 active:scale-95",
                  activeTab === tab.id
                    ? "bg-[hsl(var(--vr-violet)_/_0.15)] text-[hsl(var(--vr-violet))] border border-[hsl(var(--vr-violet)_/_0.3)] shadow-[0_0_16px_hsl(var(--vr-violet)_/_0.2)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <span>{tab.emoji}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-10 pb-24">
        <div className="animate-fade-in-up" key={activeTab}>
          {activeTab === "overview" && <OverviewSection />}
          {activeTab === "quickstart" && <QuickstartSection />}
          {activeTab === "install" && <InstallSection />}
          {activeTab === "dashboard" && <DashboardSection />}
          {activeTab === "phases" && <PhasesSection />}
          {activeTab === "reference" && <ReferenceSection />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-6">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground font-mono">
            VR Ultimate — Guide complet A à Z
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">Dashboard</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <span className="text-xs text-muted-foreground">App VR Unity</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <span className="text-xs text-muted-foreground">Meta Quest 2/3</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
