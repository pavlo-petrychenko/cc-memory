import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve(import.meta.dirname, "."),
  plugins: [react()],
  server: {
    port: 3414,
    proxy: {
      "/api": "http://localhost:3415",
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
