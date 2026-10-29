import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Vite ne charge pas les .env dans process.env. On lit les deux : Vercel
  // injecte process.env, un poste local passe par .env.
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const read = (key: string) => process.env[key] || fileEnv[key] || "";

  const dsn = read("NEXT_PUBLIC_SENTRY_DSN") || read("SENTRY_DSN");
  const environment = read("VERCEL_ENV");
  const release = read("VERCEL_GIT_COMMIT_SHA");
  const authToken = read("SENTRY_AUTH_TOKEN");
  // Sans jeton (local, CI) on ne génère pas de source maps : elles ne doivent
  // pas se retrouver dans le déploiement. Avec jeton, upload puis suppression.
  const uploadSourceMaps = mode === "production" && authToken.length > 0;

  return {
    server: {
      host: "::",
      port: 8080,
      watch: {
        ignored: ["**/vr-cinema-quest-app-unity/**", "**/origin/data/**"],
      },
      hmr: {
        overlay: false,
      },
      proxy: {
        // In local dev, /api/* is proxied to the Node sync server on :3001
        // This avoids mixed-content browser errors (HTTPS → HTTP)
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      ...(uploadSourceMaps
        ? sentryVitePlugin({
            url: "https://de.sentry.io",
            org: read("SENTRY_ORG") || "tech-trust-agency",
            project: read("SENTRY_PROJECT") || "vr-cinema-hub",
            authToken,
            telemetry: false,
            release: release ? { name: release } : undefined,
            sourcemaps: {
              filesToDeleteAfterUpload: ["./dist/**/*.map"],
            },
          })
        : []),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __SENTRY_DSN__: JSON.stringify(dsn),
      __SENTRY_ENVIRONMENT__: JSON.stringify(environment),
      __SENTRY_RELEASE__: JSON.stringify(release),
    },
    build: {
      sourcemap: uploadSourceMaps ? "hidden" : false,
      // Split vendors so a dependency bump does not invalidate the whole cache,
      // and so charting code only ships with the Statistiques route.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            const nm = /[\\/]node_modules[\\/]/;
            const pkg = (name: string) =>
              new RegExp(`[\\\\/]node_modules[\\\\/]${name}[\\\\/]`).test(id);
            if (!nm.test(id)) return;

            // React core first: every other vendor shares it, and leaving it
            // unassigned lets Rollup fold it into whichever chunk claims it first
            // — which pulled the charting bundle into the login page.
            if (pkg("react") || pkg("react-dom") || pkg("scheduler") || pkg("react-is")) {
              return "vendor-react";
            }
            if (pkg("@supabase[\\\\/][^\\\\/]+")) return "vendor-supabase";
            if (pkg("react-router") || pkg("react-router-dom")) return "vendor-router";
            if (pkg("@radix-ui[\\\\/][^\\\\/]+")) return "vendor-radix";
            if (pkg("@tanstack[\\\\/][^\\\\/]+")) return "vendor-query";

            // Everything else — notably recharts and its d3 dependencies — is left
            // to Rollup, which keeps it in a chunk reachable only from the lazy
            // route that needs it. Naming a chart chunk here had the opposite
            // effect: shared helpers landed in it and pulled it into the entry.
          },
        },
      },
    },
  };
});
