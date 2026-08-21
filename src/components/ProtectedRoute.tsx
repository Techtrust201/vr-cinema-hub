import { Navigate, Outlet } from "react-router-dom";
import { Loader2, WifiOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function ProtectedRoute() {
  const { user, role, roleStatus, loading, signOut, refreshRole } = useAuth();

  // The role read can still be running after `loading` clears (session restored
  // from storage, then the role RPC). Showing "Compte non autorisé" in that
  // window is what made a normal reload look like a permissions failure.
  if (loading || (user && !role && roleStatus === "loading")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Chargement…
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Server unreachable is not the same thing as "no access": offering a retry
  // avoids locking out legitimate users during an outage.
  if (!role && roleStatus === "unreachable") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-4">
          <WifiOff className="mx-auto text-muted-foreground" size={28} />
          <h1 className="text-lg font-semibold">Serveur injoignable</h1>
          <p className="text-sm text-muted-foreground">
            Impossible de vérifier vos droits d&apos;accès. Vérifiez votre connexion
            internet, puis réessayez. Vous êtes toujours connecté.
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => void refreshRole()}>Réessayer</Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-lg font-semibold">Compte non autorisé</h1>
          <p className="text-sm text-muted-foreground">
            Votre compte est authentifié mais aucun rôle ne lui est attribué.
            Demandez une invitation administrateur.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => void refreshRole()}>
              Réessayer
            </Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
