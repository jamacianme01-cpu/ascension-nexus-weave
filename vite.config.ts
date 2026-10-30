/**
 * ASCENSION independent Vite / TanStack Start config.
 * No third-party editor platform plugins.
 */
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 3000,
    host: true,
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  plugins: [
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    // Legacy authenticated pages still import the removed third-party auth client.
    // Keep source intact but exclude those non-V1 pages until their independent
    // replacement is implemented. Public Tree/Book and Inspect routes stay active.
    tanstackStart({ router: { routeFileIgnorePattern: "_authenticated" } }),
    nitro({ preset: "node-server" }),
    viteReact(),
  ],
});
