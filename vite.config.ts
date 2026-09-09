import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
  resolve: { alias: { "@": path.resolve(__dirname, "./src/client") } },
  server: {
    proxy: {
      // On the platform every request arrives with a verified X-Clawnify-Org-Id
      // that app-router injects (and that a client can never forge, because it
      // strips the header first). There is no such perimeter in front of
      // `vite dev`, so without this the authenticated routes answer 403 on a
      // fresh clone and the app looks broken. Dev only: the deploy pipeline
      // never reads this file.
      "/api": {
        target: "http://localhost:8792",
        changeOrigin: true,
        headers: { "X-Clawnify-Org-Id": "local-dev-org", "X-Clawnify-Caller": "user" },
      },
      // Trailing slashes matter: these are prefix matches, so a bare "/p" also
      // catches the admin's own /pages/{id} route and hands it to the Worker,
      // which answers with the built index.html and a blank screen.
      "/p/": { target: "http://localhost:8792", changeOrigin: true },
      "/r/": { target: "http://localhost:8792", changeOrigin: true },
      "/m/": { target: "http://localhost:8792", changeOrigin: true },
    },
  },
});
