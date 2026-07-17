import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Headset, Loader2, ArrowLeft, Mail } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Email envoyé");
    } catch (err: any) {
      toast.error(err.message ?? "Erreur lors de l'envoi");
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
          <p className="text-xs text-muted-foreground mt-1">Réinitialisation du mot de passe</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-6 shadow-[0_0_40px_hsl(var(--vr-violet)_/_0.08)]">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--vr-cyan)_/_0.15)] border border-[hsl(var(--vr-cyan)_/_0.4)] flex items-center justify-center mx-auto mb-4">
                <Mail size={20} className="text-[hsl(var(--vr-cyan))]" />
              </div>
              <h2 className="text-sm font-semibold mb-2">Vérifiez votre boîte mail</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Si un compte est associé à <span className="text-foreground">{email}</span>, vous recevrez un lien de réinitialisation dans quelques instants.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold mb-1">Mot de passe oublié ?</h2>
                <p className="text-xs text-muted-foreground mb-4">Entrez votre email, nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
              </div>
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
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 rounded-lg bg-[hsl(var(--vr-violet))] text-white text-sm font-medium hover:bg-[hsl(var(--vr-violet)_/_0.85)] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Envoyer le lien
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