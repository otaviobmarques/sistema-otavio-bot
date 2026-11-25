import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const api = `http://127.0.0.1:${process.env.PORT || 8790}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist/web", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.ADMIN_WEB_PORT) || 5190,
    proxy: { "/api": api, "/webhooks": api },
  },
});
