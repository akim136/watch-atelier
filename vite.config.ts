import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { researchPlugin } from "./src/research-server/plugin";
export default defineConfig({
  plugins: [react(), researchPlugin()],
  server: { port: 5173, strictPort: true, watch: { usePolling: true } },
});
