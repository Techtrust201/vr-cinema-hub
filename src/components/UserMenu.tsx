import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { roleLabel } from "@/lib/permissions";
import { LogOut, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function UserMenu() {
  const { user, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (!user) return null;
  const initial = (user.email ?? "?").charAt(0).toUpperCase();
  const label = roleLabel(role);

  const handleLogout = async () => {
    await signOut();
    toast.success("Déconnecté");
    navigate("/auth", { replace: true });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-full bg-[hsl(var(--vr-violet)_/_0.2)] border border-[hsl(var(--vr-violet)_/_0.4)] flex items-center justify-center text-xs font-semibold text-[hsl(var(--vr-violet))] hover:bg-[hsl(var(--vr-violet)_/_0.3)] transition-colors"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-border/70 bg-[hsl(var(--vr-surface))] shadow-2xl z-50 overflow-hidden animate-fade-in-up">
          <div className="px-4 py-3 border-b border-border/50">
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <Shield
                size={10}
                className={cn(
                  role === "owner"
                    ? "text-[hsl(45_90%_55%)]"
                    : role === "admin"
                      ? "text-[hsl(var(--vr-violet))]"
                      : role === "operator"
                        ? "text-[hsl(var(--vr-cyan))]"
                        : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  role === "owner"
                    ? "text-[hsl(45_90%_55%)]"
                    : role === "admin"
                      ? "text-[hsl(var(--vr-violet))]"
                      : role === "operator"
                        ? "text-[hsl(var(--vr-cyan))]"
                        : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
          >
            <LogOut size={13} /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
