import { describe, expect, it } from "vitest";

import { sentryClientOptions } from "./sentry";

describe("sentryClientOptions", () => {
  it("n'initialise rien sans DSN", () => {
    expect(
      sentryClientOptions({ dsn: "", environment: "production", release: "abc" }),
    ).toBeNull();
  });

  it("fixe le tracing à 10 % et laisse le replay éteint", () => {
    expect(
      sentryClientOptions({
        dsn: "https://public@example.ingest.de.sentry.io/1",
        environment: "preview",
        release: "0123456789abcdef",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.de.sentry.io/1",
      environment: "preview",
      release: "0123456789abcdef",
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  });

  it("omet environnement et release quand Vercel ne les fournit pas", () => {
    const options = sentryClientOptions({
      dsn: "https://public@example.ingest.de.sentry.io/1",
      environment: "",
      release: "",
    });

    expect(options).not.toHaveProperty("environment");
    expect(options).not.toHaveProperty("release");
  });
});
