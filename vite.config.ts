import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The client lives in src/client. In dev, websocket traffic is proxied to the game server.
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true } },
  },
  build: { outDir: "../../dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  test: { root: ".", include: ["tests/**/*.test.ts"] },
} as any);
