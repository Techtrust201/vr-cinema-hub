import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SectionCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: "violet" | "cyan" | "none";
}

export const SectionCard = ({ children, className, glowColor = "none" }: SectionCardProps) => {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card p-6 transition-all duration-300",
        glowColor === "violet" && "hover:border-[hsl(var(--vr-violet)_/_0.4)] hover:shadow-[0_0_30px_hsl(var(--vr-violet)_/_0.1)]",
        glowColor === "cyan" && "hover:border-[hsl(var(--vr-cyan)_/_0.4)] hover:shadow-[0_0_30px_hsl(var(--vr-cyan)_/_0.1)]",
        className
      )}
    >
      {children}
    </div>
  );
};
