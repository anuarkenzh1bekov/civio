import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The FastAPI backend (see ../backend). In production, point VITE_API_URL at it
// or serve both behind one host with /api routed to the backend.
const api = process.env.API_PROXY ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 3000, proxy: { "/api": api } },
  preview: { port: 3000, proxy: { "/api": api } },
  test: { include: ["src/**/*.test.ts"] },
});
