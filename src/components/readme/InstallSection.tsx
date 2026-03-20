import { useState } from "react";
import { CodeBlock } from "../readme/CodeBlock";
import { SectionCard } from "../readme/SectionCard";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  number: number;
  title: string;
  description: string;
  code?: string;
  codeTitle?: string;
  notes?: string[];
}

const steps: Step[] = [
  {
    number: 1,
    title: "Cloner le projet",
    description: "Si vous n'avez pas encore le projet, clonez le dépôt et placez-vous dans le dossier.",
    code: `git clone <url-du-depot> vr_ultimate\ncd vr_ultimate`,
    codeTitle: "terminal",
    notes: ["Remplacez <url-du-depot> par l'URL réelle du dépôt Git"],
  },
  {
    number: 2,
    title: "Installer les dépendances",
    description: "Installe Next.js, React, Prisma et toutes les dépendances. Peut prendre 1 à 2 minutes.",
    code: `npm install`,
    codeTitle: "terminal",
  },
  {
    number: 3,
    title: "Créer le fichier .env",
    description: "À la racine du projet, créez un fichier .env avec la configuration de base.",
    code: `DATABASE_URL="file:./prisma/dev.db"\nVIDEO_STORAGE_PATH="./data/videos"\nMAX_UPLOAD_SIZE_GB="10"`,
    codeTitle: ".env",
    notes: [
      "DATABASE_URL : base SQLite locale, ne pas modifier",
      "VIDEO_STORAGE_PATH : dossier des vidéos uploadées",
      "MAX_UPLOAD_SIZE_GB : taille max par fichier (défaut : 10 Go)",
      "Optionnel : DASHBOARD_AUTH_TOKEN pour protéger l'accès API",
    ],
  },
  {
    number: 4,
    title: "Initialiser la base de données",
    description: "Crée le fichier prisma/dev.db et les deux bibliothèques (Location et Animations).",
    code: `npm run db:seed`,
    codeTitle: "terminal",
    notes: ['Vous devez voir : "Seed OK: bibliothèques Location et Animations créées."'],
  },
  {
    number: 5,
    title: "Lancer le dashboard",
    description: "Démarre le serveur de développement avec rechargement automatique.",
    code: `npm run dev`,
    codeTitle: "terminal",
    notes: [
      "Ouvrir : http://localhost:3000",
      "Pour changer le port : npm run dev -- -p 3001",
      "Pour arrêter : Ctrl+C dans le terminal",
    ],
  },
];

const npmScripts = [
  { cmd: "npm run dev", desc: "Serveur de développement (rechargement à chaud)" },
  { cmd: "npm run build", desc: "Compile le projet pour la production" },
  { cmd: "npm run start", desc: "Lance en mode production (après build)" },
  { cmd: "npm run db:seed", desc: "Crée/met à jour les bibliothèques Location et Animations" },
  { cmd: "npm run lint", desc: "Vérifie le code avec ESLint" },
];

export const InstallSection = () => {
  const [openStep, setOpenStep] = useState<number | null>(0);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Installation</h2>
        <p className="text-muted-foreground">À faire <strong className="text-foreground/80">une seule fois</strong> par machine.</p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const isOpen = openStep === index;
          return (
            <div
              key={step.number}
              className={cn(
                "rounded-xl border transition-all duration-300",
                isOpen
                  ? "border-[hsl(var(--vr-violet)_/_0.4)] bg-[hsl(var(--vr-violet)_/_0.04)]"
                  : "border-border/50 bg-card hover:border-border"
              )}
            >
              <button
                onClick={() => setOpenStep(isOpen ? null : index)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left"
              >
                <span
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold font-mono shrink-0 transition-all",
                    isOpen
                      ? "bg-[hsl(var(--vr-violet))] text-white shadow-[0_0_16px_hsl(var(--vr-violet)_/_0.5)]"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {step.number}
                </span>
                <span className={cn("font-semibold flex-1", isOpen ? "text-foreground" : "text-foreground/80")}>
                  {step.title}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  {step.code && <CodeBlock code={step.code} title={step.codeTitle} />}
                  {step.notes && (
                    <ul className="space-y-1.5">
                      {step.notes.map((note, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--vr-violet)_/_0.6)] mt-1.5 shrink-0" />
                          {note}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scripts table */}
      <SectionCard>
        <h3 className="text-base font-semibold text-foreground mb-4">Scripts npm disponibles</h3>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(240_10%_7%)] border-b border-border/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Commande</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Rôle</th>
              </tr>
            </thead>
            <tbody>
              {npmScripts.map((s, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <code className="font-mono text-xs text-[hsl(var(--vr-cyan))] bg-[hsl(var(--vr-cyan)_/_0.08)] px-2 py-0.5 rounded">
                      {s.cmd}
                    </code>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};
