import { Link } from "react-router-dom";

const NotFound = () => (
  <div className="flex min-h-screen items-center justify-center bg-background px-4">
    <div className="text-center">
      <h1 className="mb-4 text-4xl font-bold">404</h1>
      <p className="mb-4 text-xl text-muted-foreground">Cette page n&apos;existe pas.</p>
      <Link to="/" className="text-primary underline hover:text-primary/90">
        Retour au tableau de bord
      </Link>
    </div>
  </div>
);

export default NotFound;
