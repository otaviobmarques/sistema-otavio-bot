import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const api = `http://127.0.0.1:${process.env.PORT || 8790}`;
const customerPort = Number(new URL(process.env.CUSTOMER_PUBLIC_URL || "http://localhost:5191").port) || 5191;
const port = Number(process.env.ADMIN_WEB_PORT) || 5190;

/** In development the customer area runs as a second Vite server (scripts/dev.mjs); its page navigations get conta.html. */
function customerEntry(): Plugin {
  return {
    name: "arko-customer-entry",
    configureServer(server) {
      if (port !== customerPort) return;
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? "/").split("?")[0]!;
        const page = req.method === "GET" && (req.headers.accept ?? "").includes("text/html") && !/\.[a-z0-9]+$/i.test(path)
          && !path.startsWith("/@") && !path.startsWith("/api/") && !path.startsWith("/src/") && !path.startsWith("/node_modules/");
        if (page) req.url = `/conta.html${req.url?.slice(path.length) ?? ""}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), customerEntry()],
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        admin: fileURLToPath(new URL("./index.html", import.meta.url)),
        conta: fileURLToPath(new URL("./conta.html", import.meta.url)),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    proxy: { "/api": api, "/webhooks": api },
  },
});
