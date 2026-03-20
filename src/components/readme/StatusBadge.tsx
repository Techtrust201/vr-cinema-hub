import { CheckCircle, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "done" | "todo" | "partial";

interface StatusBadgeProps {
  status: Status;
  label?: string;
  className?: string;
}

const statusConfig = {
  done: {
    icon: CheckCircle,
    label: "Fait",
    className: "bg-[hsl(140_70%_45%_/_0.12)] text-[hsl(140_70%_55%)] border-[hsl(140_70%_45%_/_0.3)]",
    glow: "shadow-[0_0_12px_hsl(140_70%_45%_/_0.3)]",
  },
  todo: {
    icon: XCircle,
    label: "À faire",
    className: "bg-[hsl(0_70%_55%_/_0.12)] text-[hsl(0_70%_65%)] border-[hsl(0_70%_55%_/_0.3)]",
    glow: "shadow-[0_0_12px_hsl(0_70%_55%_/_0.3)]",
  },
  partial: {
    icon: Clock,
    label: "Partiel",
    className: "bg-[hsl(40_90%_55%_/_0.12)] text-[hsl(40_90%_65%)] border-[hsl(40_90%_55%_/_0.3)]",
    glow: "shadow-[0_0_12px_hsl(40_90%_55%_/_0.3)]",
  },
};

export const StatusBadge = ({ status, label, className }: StatusBadgeProps) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
        config.className,
        config.glow,
        className
      )}
    >
      <Icon size={12} />
      {label ?? config.label}
    </span>
  );
};
