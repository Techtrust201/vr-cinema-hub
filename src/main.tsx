import "./instrument";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={
      <p className="min-h-screen flex items-center justify-center text-muted-foreground">
        Une erreur est survenue.
      </p>
    }
  >
    <App />
  </Sentry.ErrorBoundary>,
);
