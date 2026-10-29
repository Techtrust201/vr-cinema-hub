import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

import { sentryClientOptions } from "@/lib/sentry";

// SPA Vite + React, pas Next.js : le SDK est @sentry/react.
// Valeurs injectées au build (voir vite.config.ts), jamais commitées :
// NEXT_PUBLIC_SENTRY_DSN ou SENTRY_DSN, VERCEL_ENV, VERCEL_GIT_COMMIT_SHA.
const options = sentryClientOptions({
  dsn: __SENTRY_DSN__,
  environment: __SENTRY_ENVIRONMENT__,
  release: __SENTRY_RELEASE__,
});

if (options && import.meta.env.MODE !== "test") {
  Sentry.init({
    ...options,
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
  });
}
