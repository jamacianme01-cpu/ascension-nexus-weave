import { defineConfig } from "vite";
export default defineConfig({
  envDir: false,
  server: { host: "127.0.0.1", port: 4182, strictPort: true },
});
