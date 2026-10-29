import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/web", emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": "http://localhost:6969" },
  },
  test: { include: ["src/**/*.test.ts"] },
});
