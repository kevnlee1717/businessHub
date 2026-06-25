import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3011",
        changeOrigin: true
      },
      "/uploads": {
        target: "http://localhost:3011",
        changeOrigin: true
      }
    }
  }
});
