import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sourceTransport } from "./server/remote.ts";

export default defineConfig({
  plugins: [react(), sourceTransport()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022" },
});
