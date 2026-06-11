import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Headset, Loader2 } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Compte créé — vous êtes connecté");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connecté");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erreur d'authentification");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--vr-violet)_/_0.18)] border border-[hsl(var(--vr-violet)_/_0.4)] flex items-center justify-center glow-violet mb-4">
            <Headset size={26} className="text-[hsl(var(--vr-violet))]" />
          </div>
          <h1 className="text-2xl font-bold tracking-widest gradient-text">VR ULTIMATE</h1>
          <p className="text-xs text-muted-foreground mt-1">Plateforme de gestion VR</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-6 shadow-[0_0_40px_hsl(var(--vr-violet)_/_0.08)]">
          <div className="flex gap-2 mb-5 p-1 rounded-lg bg-background/50">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === "signin"
                  ? "bg-[hsl(var(--vr-violet))] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === "signup"
                  ? "bg-[hsl(var(--vr-violet))] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Créer un compte
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nom</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Votre nom"
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-[hsl(var(--vr-violet)_/_0.5)] focus:outline-none text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-[hsl(var(--vr-violet)_/_0.5)] focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Mot de passe</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-[hsl(var(--vr-violet)_/_0.5)] focus:outline-none text-sm"
              />
              {mode === "signup" && (
                <p className="text-[10px] text-muted-foreground/60 mt-1">Au moins 8 caractères</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 rounded-lg bg-[hsl(var(--vr-violet))] text-white text-sm font-medium hover:bg-[hsl(var(--vr-violet)_/_0.85)] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === "signin" ? "Se connecter" : "Créer le compte"}
            </button>
          </form>

          {mode === "signup" && (
            <p className="text-[10px] text-muted-foreground/60 text-center mt-4">
              Le premier compte créé devient automatiquement admin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}