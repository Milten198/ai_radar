import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Read the repo-root .env. Vite only exposes VITE_* variables to the browser,
  // so the service role key and OpenRouter key are never bundled.
  envDir: "..",
  server: { port: 5173 },
});
