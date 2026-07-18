import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function ProtectedRoute() {
  const { user, role, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground animate-pulse">Chargement…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-lg font-semibold">Compte non autorisé</h1>
          <p className="text-sm text-muted-foreground">
            Votre compte est authentifié mais aucun rôle ne lui est attribué.
            Demandez une invitation administrateur.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
            }}
          >
            Se déconnecter
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
