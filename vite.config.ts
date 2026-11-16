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

export default defineConfig(({ command }) => ({
  server: {
    port: Number(process.env["PORT"]) || 8080,
    host: "0.0.0.0",
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  plugins: [
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    // Nitro replaces the dev SSR environment, which the interface tests load
    // through ssrLoadModule. The production build still emits the server file.
    command === "build" ? nitro({ preset: "bun" }) : null,
    viteReact(),
  ],
}));
