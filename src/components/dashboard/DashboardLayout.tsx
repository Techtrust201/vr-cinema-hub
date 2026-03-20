import { Outlet, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {
  LayoutDashboard,
  Library,
  Headset,
  RefreshCw,
  Menu,
  X,
  Bell,
  Wifi,
  AlertTriangle,
  Settings,
  Clock,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useVRStore } from "@/store/vrStore";

const NAV_ITEMS = [
  { to: "/", label: "Accueil", icon: LayoutDashboard, exact: true },
  { to: "/libraries", label: "Bibliothèques", icon: Library },
  { to: "/devices", label: "Casques", icon: Headset },
  { to: "/sync", label: "Synchronisation", icon: RefreshCw },
  { to: "/settings", label: "Paramètres", icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  "/": "Accueil",
  "/libraries": "Bibliothèques",
  "/devices": "Casques",
  "/sync": "Synchronisation",
  "/settings": "Paramètres",
};

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { devices, syncLogs } = useVRStore();

  const connectedCount = devices.filter((d) => d.status === "connected").length;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const overdueDevices = devices.filter((d) => {
    if (!d.lastSyncAt) return true;
    return new Date(d.lastSyncAt).getTime() < sevenDaysAgo;
  });

  const lastSuccessLog = syncLogs.find((l) => l.status === "success");
  const lastSyncDate = lastSuccessLog
    ? new Date(lastSuccessLog.at).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const badgeCount = overdueDevices.length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
      >
        <Bell size={16} />
        {badgeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[hsl(35_90%_55%)] text-background text-[9px] font-bold flex items-center justify-center">
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border/70 bg-[hsl(var(--vr-surface))] shadow-2xl z-50 overflow-hidden animate-fade-in-up">
          <div className="px-4 py-3 border-b border-border/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notifications</p>
          </div>

          <div className="p-2 space-y-1">
            {/* Connected count */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[hsl(140_70%_40%_/_0.08)] border border-[hsl(140_70%_40%_/_0.2)]">
              <Wifi size={13} className="text-[hsl(140_70%_55%)] shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {connectedCount} casque{connectedCount !== 1 ? "s" : ""} connecté{connectedCount !== 1 ? "s" : ""}
                </p>
                <p className="text-[10px] text-muted-foreground/70">{devices.length} au total</p>
              </div>
              <span className="ml-auto text-sm font-bold tabular-nums text-[hsl(140_70%_55%)]">{connectedCount}</span>
            </div>

            {/* Last sync */}
            {lastSyncDate && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[hsl(var(--vr-violet)_/_0.06)] border border-[hsl(var(--vr-violet)_/_0.15)]">
                <Clock size={13} className="text-[hsl(var(--vr-violet))] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">Dernière synchronisation</p>
                  <p className="text-[10px] text-muted-foreground/70 font-mono">{lastSyncDate}</p>
                </div>
              </div>
            )}

            {/* Overdue devices */}
            {overdueDevices.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="px-3 text-[10px] font-semibold text-[hsl(35_90%_55%)] uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={10} />
                  Sync en retard (+7 jours)
                </p>
                {overdueDevices.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[hsl(35_90%_55%_/_0.06)] border border-[hsl(35_90%_55%_/_0.2)]"
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        d.status === "connected" ? "bg-[hsl(140_70%_55%)]" : "bg-muted-foreground/40"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground truncate">{d.name}</p>
                      <p className="text-[10px] text-muted-foreground/60">
                        {d.lastSyncAt
                          ? `Dernière sync : ${new Date(d.lastSyncAt).toLocaleDateString("fr-FR")}`
                          : "Jamais synchronisé"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {badgeCount === 0 && !lastSyncDate && connectedCount === 0 && (
              <p className="text-xs text-muted-foreground/60 text-center py-3">Aucune notification</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...args: (string | undefined | false | null)[]) {
  return args.filter(Boolean).join(" ");
}

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? "Dashboard";

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
        {/* Persistent topbar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-background/85 backdrop-blur-xl border-b border-border/50">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg hover:bg-muted/60 transition-colors lg:hidden"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-foreground tracking-tight hidden lg:block">{pageTitle}</span>
            <span className="font-bold text-sm tracking-widest gradient-text lg:hidden">VR ULTIMATE</span>
          </div>

          {/* Right: notification bell */}
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
