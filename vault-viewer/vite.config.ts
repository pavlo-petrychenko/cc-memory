import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = Number(process.env.API_PORT ?? 3416);
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/client"),
      "@shared": resolve(__dirname, "src/shared"),
      "@server": resolve(__dirname, "src/server"),
      src: resolve(__dirname, "src"),
    },
  },
  server: {
    port: Number(process.env.UI_PORT ?? 3415),
    proxy: {
      "/api": apiTarget,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          d3: ["d3"],
          markdown: ["react-markdown", "remark-gfm", "mermaid"],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-markdown", "remark-gfm"],
  },
});
