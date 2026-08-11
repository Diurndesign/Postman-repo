import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy de développement : contourne les restrictions CORS de Gutenberg
// en réécrivant /gutenberg vers https://www.gutenberg.org.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/gutenberg": {
        target: "https://www.gutenberg.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/gutenberg/, ""),
      },
    },
  },
});
