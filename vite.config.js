import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-v2-192.png", "icons/icon-v2-512.png"],
      manifest: {
        name: "Éduc'Anjou - Suivi clients",
        short_name: "Suivi clients",
        description: "Suivi des clients, prospects et relances - Éduc'Anjou",
        start_url: "/",
        display: "standalone",
        background_color: "#F3F5F1",
        theme_color: "#2F5233",
        icons: [
          { src: "icons/icon-v2-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-v2-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-v2-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
