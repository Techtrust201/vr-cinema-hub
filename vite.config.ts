import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
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
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
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
}));
