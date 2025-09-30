// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },

      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },

      "/diagram": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  define: {
    // Variables de entorno para el build
    __API_URL__: JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3000'),
  },
});
