import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "/sites/placeholder/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client"),
    },
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
  server: {
    allowedHosts: true,
  },
});
