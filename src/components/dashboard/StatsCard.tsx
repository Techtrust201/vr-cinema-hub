import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  accent?: "violet" | "cyan" | "green" | "red";
  className?: string;
}

const accentMap = {
  violet: {
    bg: "bg-[hsl(var(--vr-violet)_/_0.1)]",
    border: "border-[hsl(var(--vr-violet)_/_0.25)]",
    icon: "text-[hsl(var(--vr-violet))] bg-[hsl(var(--vr-violet)_/_0.12)]",
    value: "text-[hsl(var(--vr-violet))]",
    glow: "hover:shadow-[0_0_24px_hsl(var(--vr-violet)_/_0.18)]",
  },
  cyan: {
    bg: "bg-[hsl(var(--vr-cyan)_/_0.08)]",
    border: "border-[hsl(var(--vr-cyan)_/_0.25)]",
    icon: "text-[hsl(var(--vr-cyan))] bg-[hsl(var(--vr-cyan)_/_0.12)]",
    value: "text-[hsl(var(--vr-cyan))]",
    glow: "hover:shadow-[0_0_24px_hsl(var(--vr-cyan)_/_0.18)]",
  },
  green: {
    bg: "bg-[hsl(140_60%_50%_/_0.08)]",
    border: "border-[hsl(140_60%_50%_/_0.25)]",
    icon: "text-[hsl(140_60%_55%)] bg-[hsl(140_60%_50%_/_0.12)]",
    value: "text-[hsl(140_60%_55%)]",
    glow: "hover:shadow-[0_0_24px_hsl(140_60%_50%_/_0.18)]",
  },
  red: {
    bg: "bg-[hsl(0_70%_55%_/_0.08)]",
    border: "border-[hsl(0_70%_55%_/_0.25)]",
    icon: "text-[hsl(0_70%_65%)] bg-[hsl(0_70%_55%_/_0.12)]",
    value: "text-[hsl(0_70%_65%)]",
    glow: "hover:shadow-[0_0_24px_hsl(0_70%_55%_/_0.18)]",
  },
};

export default function StatsCard({ label, value, sub, icon: Icon, accent = "violet", className }: StatsCardProps) {
  const a = accentMap[accent];
  return (
    <div className={cn(
      "rounded-xl border p-5 flex items-start gap-4 transition-all duration-300 cursor-default",
      a.bg, a.border, a.glow, className
    )}>
      <div className={cn("rounded-lg p-2.5 shrink-0", a.icon)}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
        <p className={cn("text-2xl font-bold tabular-nums leading-none", a.value)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}
