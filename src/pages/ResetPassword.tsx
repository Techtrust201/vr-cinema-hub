import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Headset, Loader2, ArrowLeft } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase places the recovery session from the URL hash automatically.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      else {
        // Give the hash a moment to be parsed on first load
        setTimeout(async () => {
          const { data } = await supabase.auth.getSession();
          if (data.session) setReady(true);
          else setError("Lien invalide ou expiré. Demandez un nouveau lien de réinitialisation.");
        }, 800);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Le mot de passe doit faire au moins 8 caractères");
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Mot de passe mis à jour");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Erreur lors de la mise à jour");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--vr-violet)_/_0.18)] border border-[hsl(var(--vr-violet)_/_0.4)] flex items-center justify-center glow-violet mb-4">
            <Headset size={26} className="text-[hsl(var(--vr-violet))]" />
          </div>
          <h1 className="text-2xl font-bold tracking-widest gradient-text">VR ULTIMATE</h1>
          <p className="text-xs text-muted-foreground mt-1">Nouveau mot de passe</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-6 shadow-[0_0_40px_hsl(var(--vr-violet)_/_0.08)]">
          {error ? (
            <div className="text-center py-4">
              <p className="text-xs text-destructive mb-4">{error}</p>
              <Link
                to="/forgot-password"
                className="inline-block px-4 py-2 rounded-lg bg-[hsl(var(--vr-violet))] text-white text-xs font-medium hover:bg-[hsl(var(--vr-violet)_/_0.85)] transition-colors"
              >
                Demander un nouveau lien
              </Link>
            </div>
          ) : !ready ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nouveau mot de passe</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-[hsl(var(--vr-violet)_/_0.5)] focus:outline-none text-sm"
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1">Au moins 8 caractères</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Confirmer</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-[hsl(var(--vr-violet)_/_0.5)] focus:outline-none text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 rounded-lg bg-[hsl(var(--vr-violet))] text-white text-sm font-medium hover:bg-[hsl(var(--vr-violet)_/_0.85)] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Mettre à jour
              </button>
            </form>
          )}

          <Link
            to="/auth"
            className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={12} /> Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}