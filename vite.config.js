import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Proxy de développement : contourne les restrictions CORS de Gutenberg
// en réécrivant /gutenberg vers https://www.gutenberg.org.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png", "og-image.png"],
      manifest: {
        name: "Tranche",
        short_name: "Tranche",
        description:
          "Découverte de livres du domaine public en français : deux titres par période, un à la fois.",
        lang: "fr",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#E9E6DE",
        theme_color: "#E9E6DE",
        categories: ["books", "education", "lifestyle"],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Précache le shell de l'app ; épub non caché (trop volumineux).
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Réponses instantanées depuis le cache, rafraîchies en arrière-plan.
            urlPattern: /^https:\/\/gutendex\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "gutendex",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // API Wikisource (recherche / catégories) : idem, cache immédiat.
            urlPattern: /^https:\/\/fr\.wikisource\.org\/w\/api\.php.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "wikisource",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Couvertures Gutenberg : immuables → cache d'abord.
            urlPattern: /^https:\/\/www\.gutenberg\.org\/cache\/epub\/.*\.(jpg|jpeg|png)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gutenberg-covers",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    proxy: {
      "/gutenberg": {
        target: "https://www.gutenberg.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gutenberg/, ""),
      },
      "/wsexport": {
        target: "https://ws-export.wmcloud.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/wsexport/, ""),
      },
    },
  },
});
