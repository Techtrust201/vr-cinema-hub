import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

/**
 * Placeholder for the future admin invitation flow.
 * Public signup is disabled; new operators/admins will be invited here.
 */
export default function AdminInvite() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border/60 bg-[hsl(var(--vr-surface))] p-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-[hsl(var(--vr-violet)_/_0.18)] border border-[hsl(var(--vr-violet)_/_0.4)] flex items-center justify-center">
          <Shield size={22} className="text-[hsl(var(--vr-violet))]" />
        </div>
        <h1 className="text-lg font-semibold mb-2">Invitation administrateur</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Cette page accueillera bientôt le flux d&apos;invitation sécurisé.
          L&apos;inscription publique est désactivée ; aucun rôle n&apos;est attribué
          automatiquement aux nouveaux comptes.
        </p>
        <Link
          to="/auth"
          className="text-sm text-[hsl(var(--vr-cyan))] hover:underline"
        >
          Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
