import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Library,
  Headset,
  RefreshCw,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { to: "/", label: "Accueil", icon: LayoutDashboard, exact: true },
  { to: "/libraries", label: "Bibliothèques", icon: Library },
  { to: "/devices", label: "Casques", icon: Headset },
  { to: "/sync", label: "Synchronisation", icon: RefreshCw },
];

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col w-60 bg-[hsl(var(--vr-surface))] border-r border-border/50 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border/50">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--vr-violet)_/_0.18)] border border-[hsl(var(--vr-violet)_/_0.4)] flex items-center justify-center glow-violet">
              <div className="w-4 h-4 rounded-md bg-[hsl(var(--vr-violet))]" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[hsl(140_70%_55%)] border-2 border-[hsl(var(--vr-surface))] animate-pulse-glow" />
          </div>
          <div>
            <p className="font-bold text-sm tracking-widest gradient-text">VR ULTIMATE</p>
            <p className="text-[10px] text-muted-foreground font-mono">Dashboard v1.0</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? location.pathname === to : location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                  active
                    ? "bg-[hsl(var(--vr-violet)_/_0.15)] text-[hsl(var(--vr-violet))] border border-[hsl(var(--vr-violet)_/_0.3)] shadow-[0_0_16px_hsl(var(--vr-violet)_/_0.15)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    "shrink-0 transition-all",
                    active ? "text-[hsl(var(--vr-violet))]" : "group-hover:text-foreground"
                  )}
                />
                {label}
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[hsl(var(--vr-violet))] shadow-[0_0_6px_hsl(var(--vr-violet))]" />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground/60 font-mono text-center">
            Meta Quest 2 / 3
          </p>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col lg:pl-60">
        {/* Mobile topbar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-background/80 backdrop-blur-xl border-b border-border/50 lg:hidden">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg hover:bg-muted/60 transition-colors"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="font-bold text-sm tracking-widest gradient-text">VR ULTIMATE</span>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
