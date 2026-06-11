import { useAuth } from "@/hooks/useAuth";
import { LogOut, User as UserIcon, Shield } from "lucide-react";

export default function Settings() {
  const { user, signOut } = useAuth();

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-6 animate-fade-in-up">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground mt-1">Compte et informations.</p>
      </header>

      <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[hsl(var(--vr-violet)_/_0.15)] border border-[hsl(var(--vr-violet)_/_0.3)] flex items-center justify-center">
            <UserIcon size={16} className="text-[hsl(var(--vr-violet))]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Connecté en tant que</p>
            <p className="text-sm font-medium truncate">{user?.email ?? "—"}</p>
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium"
        >
          <LogOut size={14} /> Se déconnecter
        </button>
      </section>

      <section className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-[hsl(var(--vr-cyan))]" />
          <h2 className="text-sm font-semibold">À propos</h2>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
          <li>• Synchronisation OTA via Lovable Cloud — pas de serveur local.</li>
          <li>• Les casques téléchargent leurs vidéos directement par internet.</li>
          <li>• L'appairage casque se fait depuis la page <strong>Casques</strong> avec un code à 6 chiffres.</li>
        </ul>
      </section>
    </div>
  );
}