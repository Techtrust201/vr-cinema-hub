import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface PrerequisiteCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  verifyCommand: string;
  accentColor?: "violet" | "cyan";
}

export const PrerequisiteCard = ({
  icon: Icon,
  title,
  description,
  verifyCommand,
  accentColor = "violet",
}: PrerequisiteCardProps) => {
  return (
    <div
      className={cn(
        "rounded-xl border p-5 bg-card transition-all duration-300 group",
        accentColor === "violet"
          ? "border-border/50 hover:border-[hsl(var(--vr-violet)_/_0.5)] hover:shadow-[0_0_24px_hsl(var(--vr-violet)_/_0.12)]"
          : "border-border/50 hover:border-[hsl(var(--vr-cyan)_/_0.5)] hover:shadow-[0_0_24px_hsl(var(--vr-cyan)_/_0.12)]"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center mb-4",
          accentColor === "violet"
            ? "bg-[hsl(var(--vr-violet)_/_0.12)] text-[hsl(var(--vr-violet))]"
            : "bg-[hsl(var(--vr-cyan)_/_0.12)] text-[hsl(var(--vr-cyan))]"
        )}
      >
        <Icon size={20} />
      </div>

      <h3 className="font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{description}</p>

      {/* Verify command */}
      <div className="rounded-lg bg-[hsl(240_11%_5%)] border border-border/40 px-3 py-2.5 flex items-center gap-2">
        <span
          className={cn(
            "text-xs font-mono shrink-0",
            accentColor === "violet" ? "text-[hsl(var(--vr-violet))]" : "text-[hsl(var(--vr-cyan))]"
          )}
        >
          $
        </span>
        <code className="text-xs font-mono text-foreground/80">{verifyCommand}</code>
      </div>
    </div>
  );
};
