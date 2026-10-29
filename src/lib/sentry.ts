import type { BrowserOptions } from "@sentry/react";

export type SentryBuildEnv = {
  dsn: string;
  environment: string;
  release: string;
};

/**
 * Options client. `null` quand aucun DSN n'est fourni : le SDK n'est alors pas
 * initialisé, et un build local ou la CI n'envoient rien.
 * Replay n'est pas activé : pas d'intégration, et les deux taux sont à 0.
 */
export function sentryClientOptions(env: SentryBuildEnv): BrowserOptions | null {
  if (!env.dsn) return null;

  const options: BrowserOptions = {
    dsn: env.dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  };

  if (env.environment) options.environment = env.environment;
  if (env.release) options.release = env.release;

  return options;
}
